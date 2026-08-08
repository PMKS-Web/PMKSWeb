// Minimal real-mouse driver: posts HID-level events with CGEventPost.
// Usage:
//   mousectl pos                       print cursor position
//   mousectl move X Y
//   mousectl down X Y | up X Y
//   mousectl wheel X Y TICKS           vertical wheel (positive = up/zoom-in w/ ctrl)
//   mousectl click X Y                 move, then press and release
//   mousectl rclick X Y                right-click; every creation gesture in
//                                      PMKS+ starts with one
//   mousectl drag X1 Y1 X2 Y2 STEPS DELAY_US   full press-drag-release, streaming moves
//
// Build:  swiftc -O e2e/tools/mousectl.swift -o <somewhere outside the repo>
//
// Why this exists. Synthetic DOM events are not a mouse, and the difference has
// cost this project real time twice: a runaway canvas pan that Playwright's
// dispatched events could not reproduce at all, and a compositor artifact that
// only appeared under a genuine drag. CGEventPost goes in at the HID layer, so
// the browser cannot tell it from a hand.
//
// It needs Accessibility permission for whatever process runs it, and it drives
// the real cursor -- so point it at a throwaway Playwright browser window, never
// at a logged-in profile.
import CoreGraphics
import Foundation

let args = CommandLine.arguments
func post(_ e: CGEvent?) { e?.post(tap: .cghidEventTap) }
func pt(_ x: String, _ y: String) -> CGPoint { CGPoint(x: Double(x)!, y: Double(y)!) }

switch args[1] {
case "pos":
  let p = CGEvent(source: nil)!.location
  print("\(p.x) \(p.y)")
case "move":
  post(CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: pt(args[2], args[3]), mouseButton: .left))
case "down":
  post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: pt(args[2], args[3]), mouseButton: .left))
case "click":
  let p = pt(args[2], args[3])
  post(CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left))
  usleep(60000)
  post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: p, mouseButton: .left))
  usleep(40000)
  post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: p, mouseButton: .left))
case "rclick":
  let p = pt(args[2], args[3])
  post(CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .right))
  usleep(60000)
  post(CGEvent(mouseEventSource: nil, mouseType: .rightMouseDown, mouseCursorPosition: p, mouseButton: .right))
  usleep(40000)
  post(CGEvent(mouseEventSource: nil, mouseType: .rightMouseUp, mouseCursorPosition: p, mouseButton: .right))
case "up":
  post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: pt(args[2], args[3]), mouseButton: .left))
case "wheel":
  post(CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: pt(args[2], args[3]), mouseButton: .left))
  usleep(30000)
  let ticks = Int32(args[4])!
  let n = abs(ticks)
  for _ in 0..<n {
    let e = CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 1, wheel1: ticks > 0 ? 3 : -3, wheel2: 0, wheel3: 0)
    post(e)
    usleep(40000)
  }
case "drag":
  let a = pt(args[2], args[3]), b = pt(args[4], args[5])
  let steps = Int(args[6])!, delay = UInt32(args[7])!
  post(CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: a, mouseButton: .left))
  usleep(60000)
  post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: a, mouseButton: .left))
  usleep(60000)
  for i in 1...steps {
    let t = Double(i) / Double(steps)
    let p = CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t)
    post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseDragged, mouseCursorPosition: p, mouseButton: .left))
    if delay > 0 { usleep(delay) }
  }
  post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: b, mouseButton: .left))
default:
  FileHandle.standardError.write("unknown command\n".data(using: .utf8)!)
  exit(1)
}
