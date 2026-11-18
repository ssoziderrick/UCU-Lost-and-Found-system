# Mobile overflow + keyboard-only checks (run with the app on port 4000).
#   E2E_STUDENT_PW=... python3 tests/e2e/a11y_checks.py
import os
from playwright.sync_api import sync_playwright
BASE = os.environ.get("BASE_URL", "http://localhost:4000")
PW = os.environ["E2E_STUDENT_PW"]
with sync_playwright() as p:
    b = p.chromium.launch()
    # 1. No horizontal overflow at 375px on main pages
    m = b.new_context(viewport={"width": 375, "height": 812}, is_mobile=True).new_page()
    m.goto(BASE + "/login"); m.fill("#email", "okello@students.ucu.test"); m.fill("#password", PW); m.click("button[type=submit]"); m.wait_for_url(BASE + "/")
    for path in ["/", "/reports/1", "/reports/new?type=found", "/my/reports", "/my/claims", "/register"]:
        m.goto(BASE + path); m.wait_for_load_state("networkidle")
        w = m.evaluate("document.documentElement.scrollWidth")
        print(f"overflow-check {path:28} scrollWidth={w} {'PASS' if w <= 375 else 'FAIL'}")
    # 2. Keyboard-only login and report search
    k = b.new_context(viewport={"width": 1366, "height": 900}).new_page()
    k.goto(BASE + "/login"); k.wait_for_selector("#email")
    k.keyboard.press("Tab")  # skip link
    first = k.evaluate("document.activeElement.textContent")
    for _ in range(12):
        k.keyboard.press("Tab")
        if k.evaluate("document.activeElement.id") == "email": break
    k.keyboard.type("okello@students.ucu.test"); k.keyboard.press("Tab"); k.keyboard.type(PW); k.keyboard.press("Enter")
    k.wait_for_url(BASE + "/")
    outline = k.evaluate("""() => { const a=document.querySelector('.main-nav a'); a.focus(); const s=getComputedStyle(a); return s.outlineStyle+' '+s.outlineWidth; }""")
    k.focus("#q"); k.keyboard.type("keys"); k.keyboard.press("Enter"); k.wait_for_selector(".report-card")
    k.keyboard.press("Tab")
    print("keyboard first stop:", first, "| login by keyboard: PASS | focus outline:", outline)
    b.close()
