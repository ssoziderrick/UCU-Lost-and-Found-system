# End-to-end walkthrough of the reporting-to-return workflow with screenshots.
import os
from playwright.sync_api import sync_playwright
BASE = os.environ.get("BASE_URL", "http://localhost:4000")
# Logins come from the environment so no password is stored in the repository:
#   E2E_STUDENT_PW=... E2E_ADMIN_PW=... python3 tests/e2e/walkthrough.py
STUDENT_PW = os.environ["E2E_STUDENT_PW"]
ADMIN_PW = os.environ["E2E_ADMIN_PW"]
OUT = os.environ.get("SHOTS_DIR", "docs/screenshots")
os.makedirs(OUT, exist_ok=True)
errors = []
def shot(page, name): page.screenshot(path=f"{OUT}/{name}.png", full_page=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    # ---------- Desktop: finder reports a found item ----------
    ctx = b.new_context(viewport={"width": 1366, "height": 900})
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(BASE); page.wait_for_selector(".report-card"); shot(page, "01_browse_desktop")
    page.click("text=Log in"); page.fill("#email", "namusoke@students.ucu.test"); page.fill("#password", "wrong"); page.click("button[type=submit]")
    page.wait_for_selector(".alert-error"); shot(page, "02_login_failed")
    page.fill("#password", STUDENT_PW); page.click("button[type=submit]"); page.wait_for_url(BASE + "/")
    page.goto(BASE + "/reports/new?type=found"); page.wait_for_selector("#title")
    page.click("button[type=submit]"); page.wait_for_selector(".error-summary"); shot(page, "03_report_validation")
    page.fill("#title", "Brown leather wallet")
    page.select_option("#categoryId", label="Jewellery & Accessories")
    page.select_option("#locationId", label="Touch of Class Restaurant")
    page.fill("#locationDetail", "Table near the window")
    page.fill("#description", "Brown leather bi-fold wallet found on a table after lunch.")
    page.fill("#privateDetails", "Contains a library card and a folded receipt from Touch of Class dated last week.")
    shot(page, "04_report_form_filled")
    page.click("button[type=submit]"); page.wait_for_selector("h1:has-text('Brown leather wallet')"); shot(page, "05_report_published_owner_view")
    wallet_url = page.url
    page.click("text=Log out"); page.wait_for_timeout(500)
    # ---------- Mobile: owner searches and claims ----------
    m = b.new_context(viewport={"width": 375, "height": 812}, is_mobile=True, has_touch=True)
    mp = m.new_page()
    mp.goto(BASE); mp.wait_for_selector(".report-card"); shot(mp, "06_browse_mobile")
    mp.click(".menu-toggle"); shot(mp, "07_mobile_menu_open")
    mp.click("text=Log in"); mp.fill("#email", "okello@students.ucu.test"); mp.fill("#password", STUDENT_PW); mp.click("button[type=submit]")
    mp.wait_for_url(BASE + "/")
    mp.fill("#q", "wallet"); mp.click(".more-filters summary"); mp.check("input[name=type][value=found]", force=True); mp.select_option("#locationId", label="Touch of Class Restaurant")
    mp.click("button:has-text('Search')"); mp.wait_for_selector(".report-card"); shot(mp, "08_search_results_mobile")
    mp.click(".report-card a"); mp.wait_for_selector("#evidence")
    assert "library card" not in mp.content(), "PRIVATE DETAILS LEAKED"
    mp.fill("#evidence", "short"); mp.click("button:has-text('Submit claim')"); mp.wait_for_selector(".field-error"); shot(mp, "09_claim_validation_mobile")
    mp.fill("#evidence", "My wallet has my library card inside and a folded Touch of Class receipt from last week.")
    mp.click("button:has-text('Submit claim')"); mp.wait_for_selector("text=Your claim"); shot(mp, "10_claim_submitted_mobile")
    mp.goto(BASE + "/my/claims"); mp.wait_for_selector(".claim-item"); shot(mp, "11_my_claims_mobile")
    # ---------- Admin reviews ----------
    a = b.new_context(viewport={"width": 1366, "height": 900}); ap = a.new_page()
    ap.goto(BASE + "/login"); ap.fill("#email", "admin@lostfound.ucu.test"); ap.fill("#password", ADMIN_PW); ap.click("button[type=submit]")
    ap.wait_for_url(BASE + "/admin"); ap.wait_for_selector("table"); shot(ap, "12_admin_dashboard")
    ap.click("tr:has-text('Brown leather wallet') >> a:has-text('Review')"); ap.wait_for_selector("text=Claimant's evidence"); shot(ap, "13_admin_claim_compare")
    ap.click("text=Approve for collection"); ap.click("button:has-text('Record decision')"); ap.wait_for_selector(".error-summary"); shot(ap, "14_admin_decision_validation")
    ap.fill("#reason", "Library card and receipt match the finder's private details.")
    ap.click("button:has-text('Record decision')"); ap.wait_for_selector("text=Claim approved"); shot(ap, "15_admin_approved")
    mp.goto(BASE + "/my/claims"); mp.wait_for_selector("text=Collect your item"); shot(mp, "16_claimant_sees_approval_mobile")
    ap.once("dialog", lambda d: d.accept())
    ap.click("text=Confirm item collected"); ap.wait_for_selector("text=Return confirmed"); shot(ap, "17_admin_return_confirmed")
    mp.goto(wallet_url); mp.wait_for_selector("text=has been returned"); shot(mp, "18_listing_returned_mobile")
    assert mp.locator("#evidence").count() == 0
    # ---------- Phone competing claims on seed phone (report 3) ----------
    ap.goto(BASE + "/admin/claims/2"); ap.wait_for_selector("text=Other claims on this item"); shot(ap, "19_admin_competing_claims")
    # ---------- Keyboard-only: tab to skip link and through nav ----------
    k = b.new_context(viewport={"width": 1366, "height": 900}); kp = k.new_page(); kp.goto(BASE); kp.wait_for_selector(".report-card")
    kp.keyboard.press("Tab"); shot(kp, "20_keyboard_skip_link")
    focused = kp.evaluate("document.activeElement.textContent")
    kp.keyboard.press("Tab"); kp.keyboard.press("Tab"); shot(kp, "21_keyboard_focus_nav")
    print("first tab stop:", focused)
    # Unauthorised: student visiting admin page
    mp.goto(BASE + "/admin"); mp.wait_for_selector("text=only for the administrator"); shot(mp, "22_student_blocked_from_admin")
    b.close()
print("console errors:", errors)
print("E2E OK")
