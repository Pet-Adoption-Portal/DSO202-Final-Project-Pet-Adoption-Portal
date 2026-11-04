// Create an account. Data: signup-service (POST /signup), then login-service to sign straight in.
// Staff sign-up also registers a new shelter that an admin must approve (shelter-service).
import { api } from '../api.js';
import { setSession } from '../auth.js';
import { $ } from '../ui.js';

export default async function signup({ main, query }) {
  const next = query.next && query.next.startsWith('#/') ? query.next : '';
  main.innerHTML = `<div class="auth">
    <div class="auth-side">
      <div>
        <h2>Give a shelter animal a home</h2>
        <p>Adopters can save pets and apply. Shelter staff can list animals and review applications once an admin approves their shelter.</p>
      </div>
    </div>
    <div class="auth-form"><div class="inner">
      <h1 style="font-size:2rem">Create an account</h1>
      <form id="signupForm" novalidate>
        <p class="form-error" id="err"></p>
        <fieldset style="border:0;padding:0;margin:0">
          <legend class="sr-only">Account type</legend>
          <div class="role-pick">
            <label><input type="radio" name="role" value="adopter" checked>I want to adopt</label>
            <label><input type="radio" name="role" value="staff">I work at a shelter</label>
          </div>
        </fieldset>
        <div class="field"><label for="name">Full name</label><input id="name" name="name" type="text" autocomplete="name" required></div>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="new-password" minlength="8" required><span class="hint">At least 8 characters.</span></div>
        <div class="field"><label for="district">District</label><input id="district" name="district" type="text" placeholder="For example: Thimphu"></div>
        <div id="staffFields" hidden>
          <div class="field"><label for="shelterName">Shelter name</label><input id="shelterName" name="shelterName" type="text"><span class="hint">An admin checks new shelters before they can list pets.</span></div>
        </div>
        <button class="btn btn-primary" type="submit" style="width:100%">Create account</button>
      </form>
      <p class="muted" style="margin-top:20px">Already registered? <a href="#/login">Log in</a></p>
    </div></div>
  </div>`;

  const form = $('#signupForm', main);
  const staffFields = $('#staffFields', main);
  form.addEventListener('change', () => { staffFields.hidden = form.role.value !== 'staff'; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#err', main);
    err.textContent = '';
    const body = Object.fromEntries(new FormData(form));
    try {
      await api.post('/signup', body);
      const { token, user } = await api.post('/login', { email: body.email, password: body.password });
      setSession(token, user);
      location.hash = next || (user.role === 'staff' ? '#/staff' : '#/pets');
      window.dispatchEvent(new Event('session-changed'));
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
}
