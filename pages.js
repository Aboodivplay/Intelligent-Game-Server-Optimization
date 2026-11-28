import { escapeHtml as safe } from './api.js?v=auth-20261128b';

export function brand() {
  return '<a class="brand" href="#home"><span>INTELLIGENT GAME<span>SERVER OPTIMIZATION</span></span></a>';
}

export function header(user) {
  return `<header class="site-header">${brand()}<nav aria-label="Main navigation"><a href="#home">Home</a><a href="#capabilities">Capabilities</a><a href="#how-it-works">How it works</a><a href="#development">Under development</a><a href="#project">The project</a></nav><button class="button small" data-open="${user ? 'games' : 'login'}">${user ? 'Open workspace' : 'Log in'} <span>↗</span></button></header>`;
}

export function footer() {
  return `<footer><div>${brand()}<p>A graduation project at the University of Petra.<br>Built for server administrators. Starting with Minecraft.</p></div><div><a href="#project">Project & scope</a><a href="#development">Under development</a><a href="#login" data-open="login">Administrator login</a></div><small>Independent academic project. Not affiliated with Mojang or Microsoft.<br>© ${new Date().getFullYear()} Intelligent Game Server Optimization</small></footer>`;
}

function minecraftScene() {
  return `<figure class="world">
    <div class="world-frame">
      <img class="home-panorama" src="assets/minecraft/panorama-26-3.webp" alt="A white wool tent and a camp chest in the Dappled Forest" fetchpriority="high">
      <div class="block-slots" aria-hidden="true">
        <img src="assets/minecraft/crafting-table.png" alt="">
        <img src="assets/minecraft/tnt.png" alt="">
        <img src="assets/minecraft/diamond-ore.png" alt="">
      </div>
    </div>
    <figcaption><span>Dappled Forest</span> Minecraft Java 26.3</figcaption>
  </figure>`;
}

function developmentSection() {
  const milestones = [
    ['Five-minute predictions and alerts', 'Train and evaluate the LSTM on labeled sessions with real incidents. Connect live inference, show contributing signals and record the score, horizon, model version and time. Add offline retraining, reviewed model promotion, alert preferences and duplicate suppression at the configured threshold.'],
    ['Approval and reversible recovery', 'Let administrators approve or reject a recommended simulation-distance change. Enforce bounds, cooldowns and manual override. Restore the previous setting and record the decision, outcome and before-and-after readings.'],
    ['Data retention, privacy and exports', 'Verify scheduled expiry after 30 days for telemetry, predictions and alerts and 90 days for audits. Complete activity and prediction exports, validate player-data consent and permissions, and label prerecorded demonstrations separately from live readings.'],
    ['Evaluation on a real server', 'Measure five-minute event precision and recall against the 80% targets, CPU overhead against the five-percentage-point limit and update latency against the 95%-within-two-seconds target. Record an eight-hour run, a 60-second outage, recovery within 30 seconds and the interaction count for reaching an alert or action.'],
  ];
  return `<section id="development" class="development section-width section-block" aria-labelledby="development-title">
    <div class="section-heading"><div><div class="eyebrow">Project roadmap</div><h2 id="development-title">Under development</h2></div>
    <p>Features and acceptance tests still to complete for the graduation project.</p></div>
    <div class="milestone-list">${milestones.map(([name, description], index) =>
      `<details ${index === 0 ? 'open' : ''}><summary>${name}</summary><p>${description}</p></details>`
    ).join('')}</div></section>`;
}

export function landing(user) {
  return `${header(user)}<main id="content">
    <section class="hero section-width"><div class="hero-copy"><div class="eyebrow"><span class="tiny-square"></span> MINECRAFT SERVER MONITORING</div><h1>Inside your<br><span>Minecraft server.</span></h1><p>See how CPU load, memory and tick rate change as players join and your world grows. Connect your Minecraft server to start recording.</p><div class="hero-actions"><button class="button primary" data-open="${user ? 'games' : 'signup'}">Start monitoring <span>↗</span></button><a class="text-link" href="#how-it-works">See how it works <span>↓</span></a></div></div>${minecraftScene()}</section>
    <section class="section-width section-block" id="capabilities"><div class="section-heading reveal"><div><div class="eyebrow">Monitoring</div><h2>When the world slows down,<br>find out what changed.</h2></div><p>Follow hardware demand alongside what is happening in-game. Spend less time switching between tools and more time understanding the cause.</p></div><div class="feature-grid"><article class="feature feature-large reveal"><div class="feature-top"><span class="number">01</span><span class="tag green">AVAILABLE WITH AGENT</span></div><div class="signal-art" aria-hidden="true"><div class="signal-line"></div><div class="signal-bars">${Array.from({ length: 28 }, (_, i) => `<i style="--bar:${18 + (i * 17 % 65)}%;--delay:${i * .07}s"></i>`).join('')}</div><span>HARDWARE + GAME STATE</span></div><h3>The signals that matter.</h3><p>Track CPU load, Java heap, tick rate, loaded entities and online players together. Review recent history when a busy area, new build or mod changes server performance.</p></article><article class="feature reveal"><div class="feature-top"><span class="number">02</span><span class="tag purple">RESEARCH TARGET</span></div><div class="forecast-art" aria-hidden="true"><span></span><span></span><span></span><b>5<small>MINUTES AHEAD</small></b></div><h3>Working toward earlier warnings.</h3><p>The next stage of the project uses LSTM time-series research to study patterns before instability. The model targets a five-minute warning. Training and validation are still in progress.</p></article><article class="feature reveal"><div class="feature-top"><span class="number">03</span><span class="tag">ADMINISTRATOR CONTROL</span></div><div class="control-art" aria-hidden="true"><span>OBSERVE</span><i></i><span>REVIEW</span><i></i><span>DECIDE</span></div><h3>Control stays with you.</h3><p>Your workspace is for observation and informed decisions. Monitoring does not delete entities, restart the server or run commands. Automated actions are planned as a separate, permission-controlled integration.</p></article></div></section>
    <section class="architecture-section" id="how-it-works"><div class="section-width section-block"><div class="section-heading reveal"><div><div class="eyebrow">Architecture</div><h2>From your Minecraft server<br>to your control room.</h2></div><p>The monitoring agent runs beside the game.<br>The dashboard gives those signals a place to make sense.</p></div><div class="pipeline reveal"><article><span>01 / EDGE</span><div class="pipeline-symbol">▣</div><h3>Minecraft agent</h3><p>A server agent reads game state and hardware signals without changing core game files.</p></article><div class="pipeline-arrow">→</div><article><span>02 / INGEST</span><div class="pipeline-symbol">⌁</div><h3>Authenticated API</h3><p>A server-specific key sends telemetry over HTTPS. Each account sees only its own servers.</p></article><div class="pipeline-arrow">→</div><article><span>03 / ANALYZE</span><div class="pipeline-symbol">◇</div><h3>Prediction research</h3><p>The planned Python/LSTM engine prepares windows and evaluates failure probability.</p></article><div class="pipeline-arrow">→</div><article><span>04 / UNDERSTAND</span><div class="pipeline-symbol">◫</div><h3>Your control room</h3><p>Review measured values and recent history. See immediately when an agent is connected, waiting or offline.</p></article></div><div class="scope-note reveal"><span>PROJECT STATUS</span><p>Available now: one-use player invitations, read-only observer access, and telemetry monitoring on Forge and Fabric. In development: validated LSTM predictions and an audited remediation workflow.</p></div></div></section>
    <section class="section-width section-block" id="games"><div class="section-heading reveal"><div><div class="eyebrow">Supported game</div><h2>Minecraft Java Edition</h2></div><p>Choose a version for each server when you connect it.</p></div>${gameCards(false)}<div class="center-actions"><button class="button primary" data-open="${user ? 'games' : 'signup'}">${user ? 'Choose a game' : 'Create your account'} ↗</button></div></section>
    ${developmentSection()}
    <section class="project-section section-width section-block" id="project"><div class="reveal"><div class="eyebrow">Graduation project</div><h2>Built to understand<br>what happens before failure.</h2><p>Intelligent Game Server Optimization combines hardware telemetry and in-game context for modded Java servers. Our research explores the gap between a server becoming unstable and an administrator discovering the cause.</p><div class="project-team"><div><span>UNIVERSITY</span><b>University of Petra</b><small>Faculty of Information Technology</small></div><div><span>PROJECT TEAM</span><b>Abdulrahman Ashraf</b><b>Ayham Magdi Walid Al-Aju</b></div><div><span>SUPERVISOR</span><b>Dr. Eman Al Duweib</b><small>Graduation Project 2026–27</small></div></div></div></section>
    <section class="last-call section-width reveal"><div class="eyebrow">YOUR NEXT SESSION STARTS HERE</div><h2>Your community plays.<br>You see the bigger picture.</h2><button class="button primary" data-open="${user ? 'games' : 'signup'}">Open your control room ↗</button><p>Create your account, choose Minecraft, then connect your Minecraft server.</p></section>
  </main>${footer()}`;
}

export function gameCards(interactive) {
  const tag = interactive ? 'button' : 'article';
  const action = interactive ? 'type="button" data-game="minecraft"' : '';
  return `<${tag} class="supported-game" ${action}>
    <img src="assets/minecraft/grass-block.png?v=vanilla" alt="" width="56" height="58" loading="lazy">
    <span><strong>Minecraft</strong><small>Java Edition · Forge &amp; Fabric · 1.20.1–26.3</small></span>
    ${interactive ? '<span class="game-arrow" aria-hidden="true">↗</span>' : ''}
  </${tag}>`;
}

export function gameSelection(user) {
  return `${header(user)}<main id="content" class="section-width selection"><div class="eyebrow"><span class="live-dot"></span> YOUR WORKSPACE</div><h1>Choose your <span>world.</span></h1><p>Welcome, ${safe(user.name)}. Open Minecraft to manage your servers.</p>${gameCards(true)}<p><a class="button" href="#shared">Shared servers · Redeem invitation</a></p><div class="selection-footer"><span>Each server has its own connection and version setting.</span><div class="account-links">${user.authenticators ? '<button class="text-link" id="account-security">Account security</button>' : ''}<button class="text-link" id="logout">Log out ↗</button></div></div></main>${footer()}`;
}


function authLayout(title, description, body) {
  return `<main class="auth-layout" id="content">
    <section class="auth-story">
      ${brand()}
      <div><h1>Minecraft<br><span>server monitoring.</span></h1>
        <p>Track server performance and investigate slowdowns.</p>
        <img class="auth-block" src="assets/minecraft/grass-block.png?v=vanilla" alt="" width="92" height="96">
      </div>
      <a class="text-link" href="#home">← Back to the project</a>
    </section>
    <section class="auth-form-wrap"><div class="auth-form">
      <h2>${title}</h2><p>${description}</p>${body}
    </div></section>
  </main>`;
}

export function authPage(signup = false) {
  const nameField = `<label for="name">Display name (optional)</label>
    <input id="name" name="name" autocomplete="nickname" maxlength="80" placeholder="A nickname is fine">`;
  const confirmation = `<label for="confirm-password">Confirm password</label>
    <input id="confirm-password" name="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required>
    <div class="password-guide" id="password-guide">Use a unique passphrase of at least 12 characters.</div>`;
  const help = `<div class="forgot-row">
    <button type="button" class="text-link" id="resend-confirmation">Resend confirmation</button>
    <button type="button" class="text-link" id="forgot-password">Forgot password?</button>
  </div>`;

  return authLayout(signup ? 'Create an account' : 'Log in',
    signup ? 'Create a private workspace for your Minecraft servers.' : 'Sign in to your server workspace.',
    `<form id="auth-form" method="post" novalidate data-mode="${signup ? 'signup' : 'login'}">
      ${signup ? nameField : ''}
      <label for="email">Email address</label>
      <input id="email" name="email" type="email" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="254" required>
      <div class="label-row"><label for="password">Password</label><button type="button" class="text-link" id="show-password">Show</button></div>
      <input id="password" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}"
        ${signup ? 'minlength="12" maxlength="128" aria-describedby="password-guide"' : ''} required>
      ${signup ? confirmation : help}
      <div id="form-error" class="form-error" role="alert"></div>
      <button class="button primary full" type="submit">${signup ? 'Create account' : 'Log in'}</button>
    </form>
    ${signup ? '' : `<details><summary>Email link opened localhost?</summary>
      <p>In the same browser where you requested the email, paste the address from that tab here.</p>
      <form id="local-email-link" autocomplete="off"><label for="return-address">Return address</label>
        <input id="return-address" type="password" autocomplete="off" spellcheck="false" required>
        <p class="form-error" role="alert"></p><button type="submit" class="button">Finish email verification</button>
      </form></details>`}
    <p class="auth-switch">${signup ? 'Already have an account?' : 'New to the project?'}
      <a href="#${signup ? 'login' : 'signup'}">${signup ? 'Log in' : 'Create an account'}</a></p>`);
}

export function codeFields() {
  return `<label for="auth-code">Six-digit code</label>
    <input id="auth-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required>
    <div class="form-error" role="alert" data-code-error></div>
    <button class="button primary full" type="submit">Verify code</button>`;
}

export function verificationPage(factors) {
  const options = factors.map(factor => `<option value="${safe(factor.id)}">${safe(factor.name)}</option>`).join('');
  return authLayout('Verify your login', 'Enter the current code from your authenticator app.',
    `<form id="verify-login"><label for="factor-id">Authenticator</label>
       <select id="factor-id" name="factor">${options}</select>${codeFields()}
     </form><button class="text-link" id="cancel-login">Back to login</button>`);
}

export function passwordChangePage() {
  return authLayout('Choose a new password', 'Use a unique passphrase of at least 12 characters.',
    `<form id="new-password-form">
      <label for="new-password">New password</label><input id="new-password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required>
      <label for="confirm-new-password">Confirm new password</label><input id="confirm-new-password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required>
      <div id="form-error" class="form-error" role="alert"></div>
      <button class="button primary full" type="submit">Save new password</button>
    </form>`);
}
