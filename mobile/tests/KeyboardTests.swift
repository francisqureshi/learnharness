import XCTest
final class KeyboardTests: XCTestCase {
  // Run against the isolated resume fixture, whose shared last lesson has a
  // pending quiz. This writes only an unsent device-local draft.
  func testResumeDraftAfterRelaunch() throws {
    let app = XCUIApplication(bundleIdentifier: "net.learnharness.personalpreview")
    app.launch()
    let editor = app.textViews.firstMatch
    XCTAssertTrue(editor.waitForExistence(timeout: 30))
    editor.tap()
    let tutorial = app.buttons["Continue"].firstMatch
    if tutorial.waitForExistence(timeout: 2) { tutorial.tap() }
    editor.tap()
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
    let text = "Native resume draft"
    app.typeText(text)
    let saved = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
      (editor.value as? String)?.contains(text) == true
    }, object: nil)
    XCTAssertEqual(XCTWaiter.wait(for: [saved], timeout: 5), .completed)
    app.terminate()
    app.launch()
    let restored = app.textViews.firstMatch
    XCTAssertTrue(restored.waitForExistence(timeout: 30))
    let recovered = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
      (restored.value as? String)?.contains(text) == true
    }, object: nil)
    XCTAssertEqual(XCTWaiter.wait(for: [recovered], timeout: 10), .completed)
    XCTAssertFalse(app.keyboards.firstMatch.exists, "Relaunch must not open the keyboard")
    XCUIDevice.shared.press(.home)
    app.activate()
    XCTAssertTrue(app.buttons["Open sidebar"].firstMatch.waitForExistence(timeout: 10))
    XCTAssertTrue((restored.value as? String)?.contains(text) == true)
    let shot = XCTAttachment(screenshot: app.screenshot()); shot.lifetime = .keepAlways; add(shot)
  }

  func testKeyboardKeepsHeaderVisible() throws {
    let app = XCUIApplication(bundleIdentifier: "net.learnharness.personalpreview")
    app.launch()
    let menu = app.buttons["Open sidebar"].firstMatch
    XCTAssertTrue(menu.waitForExistence(timeout: 20))
    let before = menu.frame
    let editor = app.textViews.firstMatch
    XCTAssertTrue(editor.waitForExistence(timeout: 10))
    editor.tap()
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
    let tutorial = app.buttons["Continue"].firstMatch
    if tutorial.waitForExistence(timeout: 2) { tutorial.tap() }
    let keyboardReady = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
      app.keyboards.keys.count > 10 && app.keyboards.firstMatch.frame.minY < app.frame.maxY
    }, object: nil)
    XCTAssertEqual(XCTWaiter.wait(for: [keyboardReady], timeout: 5), .completed, "Use the visible software keyboard, not only the hardware-keyboard accessory")
    let stable = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
      abs(menu.frame.minY - before.minY) <= 3
    }, object: nil)
    XCTAssertEqual(XCTWaiter.wait(for: [stable], timeout: 5), .completed, "Header must settle at its original screen position")
    let shot = XCTAttachment(screenshot: app.screenshot()); shot.lifetime = .keepAlways; add(shot)
    print("LH_KEYBOARD headerBefore=\(before) headerAfter=\(menu.frame) keyboard=\(app.keyboards.firstMatch.frame)")
    XCTAssertEqual(menu.frame.minY, before.minY, accuracy: 3, "Keyboard must not move the header")
    XCTAssertTrue(menu.isHittable, "Header remains on screen")
    let send = app.buttons["Send"].firstMatch
    XCTAssertLessThanOrEqual(send.frame.maxY, app.keyboards.firstMatch.frame.minY, "Composer controls must stay above keyboard")
  }
  func testSettingsNavigationAndKeyboard() throws {
    let app = XCUIApplication(bundleIdentifier: "net.learnharness.personalpreview")
    app.launch()
    let menu = app.buttons["Open sidebar"].firstMatch
    XCTAssertTrue(menu.waitForExistence(timeout: 20)); menu.tap()
    let settings = app.buttons.matching(NSPredicate(format: "label ==[c] %@", "Settings")).firstMatch
    XCTAssertTrue(settings.waitForExistence(timeout: 5)); settings.tap()
    let appearance = app.buttons["Appearance"].firstMatch
    XCTAssertTrue(appearance.waitForExistence(timeout: 5))
    let indexShot = XCTAttachment(screenshot: app.screenshot()); indexShot.lifetime = .keepAlways; add(indexShot)
    appearance.tap()
    let back = app.buttons["Back to settings"].firstMatch
    XCTAssertTrue(back.waitForExistence(timeout: 5))
    let before = back.frame
    let field = app.textFields["background hex"].firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5)); field.tap()
    let keyboardReady = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
      app.keyboards.keys.count > 10 && app.keyboards.firstMatch.frame.minY < app.frame.maxY
    }, object: nil)
    XCTAssertEqual(XCTWaiter.wait(for: [keyboardReady], timeout: 5), .completed)
    XCTAssertEqual(back.frame.minY, before.minY, accuracy: 3)
    XCTAssertTrue(back.isHittable)
    XCTAssertLessThanOrEqual(field.frame.maxY, app.keyboards.firstMatch.frame.minY)
    let editShot = XCTAttachment(screenshot: app.screenshot()); editShot.lifetime = .keepAlways; add(editShot)
    back.tap()
    XCTAssertTrue(appearance.waitForExistence(timeout: 5))
    app.buttons["Close settings"].firstMatch.tap()
    XCTAssertTrue(menu.waitForExistence(timeout: 5))
  }
}
