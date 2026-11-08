import XCTest
final class KeyboardTests: XCTestCase {
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
}
