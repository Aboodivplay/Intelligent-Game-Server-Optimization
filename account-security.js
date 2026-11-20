import { currentUser, enrollAuthenticator, removeAuthenticator, verifyAuthenticator } from './session.js?v=accounts-20261120';
import { escapeHtml as safe } from './api.js?v=accounts-20261120';
import { codeFields } from './pages.js?v=accounts-20261120';

// Keep setup secrets inside the dialog. Only a successful code check enables a factor.
export function showAccountSecurity(user, { showModal, onUpdate, toast }) {
  const modal = document.querySelector('#modal');
  const devices = user.authenticators;
  const rows = devices.map(device => `<li>${safe(device.name)}
    <button class="text-link" type="button" data-remove-factor="${safe(device.id)}">Remove</button></li>`).join('');
  showModal(`<h2>Account security</h2>
    <p>${devices.length ? 'Two-step login is on. You can add a backup authenticator here.' : 'Add an authenticator app to require a six-digit code after your password.'}</p>
    ${rows ? '<ul>' + rows + '</ul>' : ''}
    <form id="add-authenticator"><label for="device-name">Authenticator name</label>
      <input id="device-name" name="device" maxlength="50" value="${devices.length ? 'Backup authenticator' : 'My authenticator'}" required>
      <div class="form-error" role="alert"></div><div class="actions">
      <button class="button" type="button" data-close>Close</button><button class="button primary" type="submit">Add authenticator</button></div>
    </form>`);

  const form = modal.querySelector('#add-authenticator');
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    try {
      const factor = await enrollAuthenticator(form.elements.device.value.trim());
      if (!modal.open || !form.isConnected) { await removeAuthenticator(factor.id); return; }
      showEnrollment(factor, { modal, showModal, onUpdate, toast });
    } catch (error) { form.querySelector('[role=alert]').textContent = error.message; }
    finally { button.disabled = false; }
  };

  modal.querySelectorAll('[data-remove-factor]').forEach(button => {
    button.onclick = () => {
      const id = button.dataset.removeFactor;
      const device = devices.find(item => item.id === id);
      showModal(`<h2>Remove ${safe(device.name)}?</h2><p>${devices.length === 1
        ? 'This is your last authenticator. Future logins will only require your password.'
        : 'You can still sign in with your other authenticator.'}</p><div role="alert" class="form-error"></div>
        <div class="actions"><button class="button" data-close>Cancel</button><button class="button danger" id="remove-factor">Remove authenticator</button></div>`);
      const remove = modal.querySelector('#remove-factor');
      remove.onclick = async () => {
        remove.disabled = true;
        try { await removeAuthenticator(id); onUpdate(await currentUser()); modal.close(); toast('Authenticator removed.'); }
        catch (error) { modal.querySelector('[role=alert]').textContent = error.message; remove.disabled = false; }
      };
    };
  });
}

function showEnrollment(factor, { modal, showModal, onUpdate, toast }) {
  showModal(`<h2>Set up your authenticator</h2><p>Scan this QR code in your app, then enter the code it shows.</p>
    <img class="authenticator-qr" alt="Authenticator setup QR code">
    <details><summary>Enter a setup key manually</summary><code class="setup-key"></code></details>
    <form id="enrollment-form">${codeFields()}</form><button class="text-link" type="button" data-close>Cancel setup</button>`);
  modal.querySelector('img').src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(factor.totp.qr_code);
  modal.querySelector('.setup-key').textContent = factor.totp.secret;
  const form = modal.querySelector('#enrollment-form');
  let verifying = false;
  let verified = false;

  // Canceling setup discards only the new, unverified device.
  const cancel = event => { if (verifying) event.preventDefault(); };
  modal.addEventListener('cancel', cancel);
  modal.addEventListener('close', () => {
    modal.removeEventListener('cancel', cancel);
    if (!verified) removeAuthenticator(factor.id).catch(() => {});
  }, { once: true });

  form.onsubmit = async event => {
    event.preventDefault();
    if (verifying) return;
    verifying = true;
    const submit = form.querySelector('[type=submit]');
    const close = modal.querySelector('[data-close]');
    submit.disabled = close.disabled = true;
    try {
      const account = await verifyAuthenticator(factor.id, form.elements.code.value);
      verified = true;
      onUpdate(account);
      modal.close();
      toast('Two-step login is on.');
    } catch (error) {
      form.querySelector('[data-code-error]').textContent = error.message;
      form.elements.code.select();
    } finally { verifying = false; submit.disabled = close.disabled = false; }
  };
}
