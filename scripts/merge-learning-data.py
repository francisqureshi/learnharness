#!/usr/bin/env python3
"""Merge a reviewed, quiescent LearnHarness data snapshot; never settings/auth.

Caller must stop the destination service and snapshot it first. This script
validates the complete merge before writing. Conflicting IDs fail closed.
"""
import argparse
import json
import os
from pathlib import Path
import tempfile


def read(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def prepare(source, target):
    writes = {}
    counts = {}
    source_ids = set()
    for folder, prefix in [('chats', 'chat_'), ('jobs', 'job_')]:
        count = 0
        for file in sorted((source / folder).glob('*.json')):
            if file.name.startswith('._'):
                continue
            record = read(file)
            ident = record.get('id')
            if not isinstance(ident, str) or not ident.startswith(prefix) or file.name != ident + '.json':
                raise ValueError('Invalid record identity')
            if folder == 'chats':
                if record.get('version', 1) != 1 or not isinstance(record.get('messages'), list):
                    raise ValueError('Unsupported chat format')
                source_ids.add(ident)
            else:
                if record.get('status') not in ('done', 'error', 'cancelled'):
                    raise ValueError('Source job is not settled')
                if record.get('delivery', {}).get('status') not in ('delivered', None):
                    raise ValueError('Source job has pending delivery')
                if record.get('chatId') not in source_ids:
                    raise ValueError('Job references an absent source lesson')
            dest = target / folder / file.name
            if dest.exists():
                if read(dest) != record:
                    raise ValueError(f'Conflicting {folder} ID: {ident}')
            else:
                writes[dest] = json.dumps(record, ensure_ascii=False, indent='\t') + '\n'
                count += 1
        counts[folder] = count
    source_graph = source / 'graph'
    target_graph = target / 'graph'
    if read(source_graph / 'format.json', {'version': 1}) != {'version': 1}:
        raise ValueError('Unsupported source graph version')
    if read(target_graph / 'format.json', {'version': 1}) != {'version': 1}:
        raise ValueError('Unsupported destination graph version')
    merged = {}
    for name in ('nodes', 'chains', 'coverage', 'sessions'):
        file = source_graph / (name + '.jsonl')
        dest = target_graph / file.name
        incoming = [json.loads(line) for line in file.read_text().splitlines() if line.strip()] if file.exists() else []
        existing = [json.loads(line) for line in dest.read_text().splitlines() if line.strip()] if dest.exists() else []
        rows = list(existing)
        added = 0
        for row in incoming:
            if row in rows:
                continue
            if name in ('nodes', 'chains') and any(r.get('id') == row.get('id') for r in rows):
                raise ValueError(f'Conflicting graph {name} ID')
            if name in ('coverage', 'sessions') and row.get('chatId') not in source_ids:
                raise ValueError('Graph references an absent source lesson')
            rows.append(row)
            added += 1
        merged[name] = rows
        counts[name] = added
        if added:
            writes[dest] = ''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in rows)
    node_ids = {r['id'] for r in merged['nodes'] if 'id' in r}
    for chain in merged['chains']:
        if 'premises' in chain and not set(chain['premises'] + [chain['conclusion']]) <= node_ids:
            raise ValueError('Chain references missing nodes')
    for row in merged['nodes'] + merged['chains']:
        for point in row.get('provenance', []):
            ident = point['chatId']
            if ident in source_ids and point.get('messageId') and point.get('messageId') not in {m.get('id') for m in read(source / 'chats' / (ident + '.json'))['messages']}:
                raise ValueError('Graph provenance references a missing message')
    # Keep the destination's graph appearance settings. Positions are just
    # presentation hints, so copy only previously unseen node positions.
    positions = read(source_graph / 'positions.json', {})
    dest = target_graph / 'positions.json'
    current = read(dest, {'positions': {}})
    if isinstance(positions.get('positions'), dict) and isinstance(current.get('positions'), dict):
        extra = {k: v for k, v in positions['positions'].items() if k not in current['positions']}
        if extra:
            writes[dest] = json.dumps({**current, 'positions': {**current['positions'], **extra}}, indent='\t') + '\n'
    if not (target_graph / 'format.json').exists() and any(counts[k] for k in ('nodes', 'chains', 'coverage', 'sessions')):
        writes[target_graph / 'format.json'] = '{"version":1}\n'
    return writes, counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    writes, counts = prepare(args.source, args.destination)
    if args.apply:
        for dest, text in writes.items():
            dest.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=dest.parent)
            try:
                with os.fdopen(fd, 'w') as file:
                    file.write(text)
                    file.flush()
                    os.fsync(file.fileno())
                os.replace(tmp, dest)
            finally:
                if os.path.exists(tmp):
                    os.unlink(tmp)
    print(json.dumps({'applied': args.apply, 'new_records': counts}))


if __name__ == '__main__':
    main()
