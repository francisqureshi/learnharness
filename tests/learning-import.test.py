import importlib.util
import json
from pathlib import Path
import sys
sys.dont_write_bytecode = True
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('merge', Path(__file__).parents[1] / 'scripts/merge-learning-data.py')
merge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(merge)

class LearningImportTest(unittest.TestCase):
    def test_preserves_destination_and_is_repeatable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, target = root / 'source', root / 'target'
            (source / 'chats').mkdir(parents=True)
            target.mkdir()
            record = {'id': 'chat_import', 'version': 1, 'messages': []}
            (source / 'chats/chat_import.json').write_text(json.dumps(record))
            (source / 'settings.json').write_text('{"private":"source"}')
            (target / 'settings.json').write_text('{"private":"keep"}')
            (target / 'auth.json').write_text('do not touch')
            writes, counts = merge.prepare(source, target)
            self.assertEqual(counts['chats'], 1)
            self.assertEqual(set(writes), {target / 'chats/chat_import.json'})
            for dest, text in writes.items():
                dest.parent.mkdir(exist_ok=True)
                dest.write_text(text)
            self.assertEqual(merge.prepare(source, target)[0], {})
            self.assertEqual((target / 'settings.json').read_text(), '{"private":"keep"}')
            self.assertEqual((target / 'auth.json').read_text(), 'do not touch')
            record['messages'] = [{'id': 'different'}]
            (source / 'chats/chat_import.json').write_text(json.dumps(record))
            with self.assertRaisesRegex(ValueError, 'Conflicting'):
                merge.prepare(source, target)

    def test_rejects_active_jobs_before_any_write(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'jobs').mkdir()
            (root / 'jobs/job_active.json').write_text(json.dumps({'id':'job_active','status':'running'}))
            with self.assertRaisesRegex(ValueError, 'not settled'):
                merge.prepare(root, root / 'target')
            self.assertFalse((root / 'target').exists())

if __name__ == '__main__':
    unittest.main()
