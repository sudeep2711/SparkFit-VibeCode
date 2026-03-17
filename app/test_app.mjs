import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';

const BASE_URL = 'http://localhost:8081';
const SCREENSHOTS_DIR = './test_screenshots';
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let stepCount = 0;
async function screenshot(page, name) {
  stepCount++;
  const filename = `${SCREENSHOTS_DIR}/${String(stepCount).padStart(2, '0')}_${name}.png`;
  await page.screenshot({ path: filename, fullPage: false });
  console.log(`  📸 ${filename}`);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);

  // Capture console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(`PAGE ERROR: ${err.message}`));

  try {
    // ─── STEP 1: Load the app ───────────────────────────────────────────────
    console.log('\n[1] Loading app...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await screenshot(page, 'welcome_screen');
    console.log('  ✅ App loaded');

    // ─── STEP 2: Check Welcome Screen elements ──────────────────────────────
    console.log('\n[2] Checking Welcome Screen...');
    const title = await page.locator('text=SparkFit').first().isVisible();
    const emailInput = await page.locator('input[placeholder="email@address.com"]').isVisible();
    const passwordInput = await page.locator('input[placeholder="Password"]').isVisible();
    const signInBtn = await page.locator('text=Sign in').isVisible();
    const signUpBtn = await page.locator('text=Sign up').isVisible();
    console.log(`  Title visible: ${title}`);
    console.log(`  Email input: ${emailInput}`);
    console.log(`  Password input: ${passwordInput}`);
    console.log(`  Sign In button: ${signInBtn}`);
    console.log(`  Sign Up button: ${signUpBtn}`);

    // ─── STEP 3: Try sign in with empty fields ──────────────────────────────
    console.log('\n[3] Testing empty field sign-in...');
    await page.click('text=Sign in');
    await page.waitForTimeout(1000);
    await screenshot(page, 'empty_signin_attempt');
    const errorAfterEmpty = await page.locator('text=/error|invalid|required/i').count();
    console.log(`  Error shown after empty submit: ${errorAfterEmpty > 0}`);

    // ─── STEP 4: Try sign in with bad credentials ───────────────────────────
    console.log('\n[4] Testing invalid credentials...');
    await page.fill('input[placeholder="email@address.com"]', 'fake@test.com');
    await page.fill('input[placeholder="Password"]', 'wrongpassword');
    await page.click('text=Sign in');
    await page.waitForTimeout(2000);
    await screenshot(page, 'invalid_credentials_error');
    const authError = await page.locator('text=/invalid|incorrect|wrong|error/i').count();
    console.log(`  Auth error shown: ${authError > 0}`);
    const errorText = await page.locator('[style*="color: red"], [style*="color:red"]').first().textContent().catch(() => 'none');
    console.log(`  Error message: "${errorText}"`);

    // ─── STEP 5: Try sign up with a test account ────────────────────────────
    console.log('\n[5] Testing sign-up flow...');
    const testEmail = `testuser_${Date.now()}@sparkfit-test.com`;
    const testPassword = 'TestPassword123!';
    await page.fill('input[placeholder="email@address.com"]', testEmail);
    await page.fill('input[placeholder="Password"]', testPassword);
    await screenshot(page, 'signup_filled');
    await page.click('text=Sign up');
    await page.waitForTimeout(3000);
    await screenshot(page, 'after_signup');

    const currentUrl = page.url();
    console.log(`  URL after signup: ${currentUrl}`);

    // Check what happened — did we land on onboarding or get an error?
    const onboardingVisible = await page.locator('text=SparkFit Coach').isVisible().catch(() => false);
    const emailVerifyMsg = await page.locator('text=/check your inbox|verify/i').isVisible().catch(() => false);
    const stillOnWelcome = await page.locator('text=Your AI Fitness Coach').isVisible().catch(() => false);

    console.log(`  Landed on onboarding: ${onboardingVisible}`);
    console.log(`  Email verification prompt: ${emailVerifyMsg}`);
    console.log(`  Still on welcome screen: ${stillOnWelcome}`);

    if (onboardingVisible) {
      // ─── STEP 6: Onboarding flow ──────────────────────────────────────────
      console.log('\n[6] Testing onboarding flow...');
      await screenshot(page, 'onboarding_start');

      // Answer: Goal
      console.log('  Answering: Goal...');
      await page.locator('text=Build Muscle').click();
      await page.waitForTimeout(800);
      await screenshot(page, 'onboarding_after_goal');

      // Answer: Fitness level
      console.log('  Answering: Fitness level...');
      await page.locator('text=Intermediate').click();
      await page.waitForTimeout(800);
      await screenshot(page, 'onboarding_after_level');

      // Answer: Days per week
      console.log('  Answering: Days per week...');
      await page.locator('text=4 days').click();
      await page.waitForTimeout(800);
      await screenshot(page, 'onboarding_after_days');

      // Answer: Location
      console.log('  Answering: Training location...');
      await page.locator('text=Gym').click();
      await page.waitForTimeout(800);
      await screenshot(page, 'onboarding_after_location');

      // Confirmation screen
      console.log('  Waiting for confirmation...');
      await page.waitForSelector('text=Looks good?', { timeout: 5000 }).catch(() => {});
      await screenshot(page, 'onboarding_confirmation');
      const confirmVisible = await page.locator('text=Looks good?').isVisible().catch(() => false);
      console.log(`  Confirmation screen visible: ${confirmVisible}`);

      if (confirmVisible) {
        console.log('  Confirming plan generation...');
        await page.locator("text=Yes, generate my plan!").click();
        await screenshot(page, 'onboarding_generating');
        console.log('  Waiting for plan generation (up to 30s)...');

        // Wait for navigation to Main or error
        await page.waitForTimeout(30000);
        await screenshot(page, 'after_plan_generation');

        const dashboardVisible = await page.locator("text=Today's Workout").isVisible().catch(() => false);
        const genError = await page.locator('text=/went wrong|error/i').isVisible().catch(() => false);
        console.log(`  Dashboard loaded: ${dashboardVisible}`);
        console.log(`  Generation error: ${genError}`);

        if (dashboardVisible) {
          // ─── STEP 7: Dashboard checks ────────────────────────────────────
          console.log('\n[7] Testing Dashboard...');
          await screenshot(page, 'dashboard');

          const startBtn = await page.locator('text=Start Workout').isVisible().catch(() => false);
          const exerciseList = await page.locator('text=Exercises').isVisible().catch(() => false);
          console.log(`  Start Workout button: ${startBtn}`);
          console.log(`  Exercise list visible: ${exerciseList}`);

          if (startBtn) {
            // ─── STEP 8: Start Workout ──────────────────────────────────────
            console.log('\n[8] Starting workout...');
            await page.locator('text=Start Workout').click();
            await page.waitForTimeout(2000);
            await screenshot(page, 'workout_active');

            const logSetBtn = await page.locator('text=Log Set & Rest').isVisible().catch(() => false);
            const exerciseName = await page.locator('text=/Set 1 of/').isVisible().catch(() => false);
            console.log(`  "Log Set & Rest" button visible: ${logSetBtn}`);
            console.log(`  Set counter visible: ${exerciseName}`);

            if (logSetBtn) {
              console.log('  Logging a set...');
              await page.locator('text=Log Set & Rest').click();
              await page.waitForTimeout(1500);
              await screenshot(page, 'after_log_set_rest_timer');
              const restTimer = await page.locator('text=Rest Period').isVisible().catch(() => false);
              console.log(`  Rest timer appeared: ${restTimer}`);
            }
          }
        }
      }
    }

    // ─── STEP N: Check bottom tabs (if on main) ──────────────────────────────
    console.log('\n[N] Checking bottom navigation tabs...');
    const tabDashboard = await page.locator('text=Dashboard').isVisible().catch(() => false);
    const tabPlan = await page.locator('text=WorkoutPlan').isVisible().catch(() => false);
    const tabProgress = await page.locator('text=Progress').isVisible().catch(() => false);
    const tabCoach = await page.locator('text=AICoach').isVisible().catch(() => false);
    console.log(`  Dashboard tab: ${tabDashboard}`);
    console.log(`  WorkoutPlan tab: ${tabPlan}`);
    console.log(`  Progress tab: ${tabProgress}`);
    console.log(`  AICoach tab: ${tabCoach}`);

  } catch (err) {
    console.error('\n❌ Test crashed:', err.message);
    await screenshot(page, 'CRASH');
  }

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────');
  if (consoleErrors.length > 0) {
    console.log(`\n⚠️  Browser console errors (${consoleErrors.length}):`);
    consoleErrors.forEach(e => console.log('  •', e));
  } else {
    console.log('\n✅ No browser console errors');
  }
  console.log(`\n📁 Screenshots saved to: ${SCREENSHOTS_DIR}/`);

  await browser.close();
}

run();
