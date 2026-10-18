const authMessage = document.querySelector("#auth-message");
const authForm = document.querySelector("[data-auth-form]");
const config = window.PACIFIC_SUPABASE_CONFIG;
let hasSupabaseConfig = Boolean(config && config.url && config.anonKey);

if (hasSupabaseConfig) {
  try {
    const projectUrl = new URL(config.url);
    hasSupabaseConfig = projectUrl.protocol === "https:" || projectUrl.protocol === "http:";
  } catch {
    hasSupabaseConfig = false;
  }
}

function showAuthMessage(message, kind = "error") {
  if (!authMessage) return;
  authMessage.textContent = message;
  authMessage.className = `auth-message ${kind}`;
  authMessage.hidden = false;
}

function showSetupMessage() {
  showAuthMessage("Sign-in setup is not complete yet. Add your Supabase project URL and public anon key in supabase-config.js.", "error");
}

let authClient = null;
if (!window.supabase || typeof window.supabase.createClient !== "function") {
  showAuthMessage("Could not load the authentication service. Check your internet connection and reload.", "error");
} else if (!hasSupabaseConfig) {
  showSetupMessage();
} else {
  authClient = window.supabase.createClient(config.url, config.anonKey);
}

document.querySelectorAll("[data-toggle-password]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.querySelector(button.dataset.togglePassword);
    if (!input) return;
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    button.textContent = reveal ? "Hide" : "Show";
    button.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
    button.setAttribute("aria-pressed", String(reveal));
  });
});

if (authForm) {
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!authClient) {
      showSetupMessage();
      return;
    }

    const formType = authForm.dataset.authForm;
    const submitButton = authForm.querySelector('[type="submit"]');
    const formData = new FormData(authForm);
    const email = String(formData.get("email") || "").trim();
    submitButton.disabled = true;
    submitButton.setAttribute("aria-busy", "true");
    if (authMessage) authMessage.hidden = true;

    try {
      let result;
      if (formType === "sign-in") {
        result = await authClient.auth.signInWithPassword({
          email,
          password: String(formData.get("password") || "")
        });
        if (result.error) throw result.error;
        window.location.assign("index.html");
      } else if (formType === "sign-up") {
        result = await authClient.auth.signUp({
          email,
          password: String(formData.get("password") || ""),
        });
        if (result.error) throw result.error;
        if (result.data.session) {
          window.location.assign("index.html");
        } else {
          const verifyForm = document.querySelector("#signup-verification-form");
          const verifyEmail = document.querySelector("#verification-email");
          const verificationStep = document.querySelector("#signup-verification");
          const signupIntro = document.querySelector("#signup-intro");
          const authCard = document.querySelector(".auth-card");
          if (!verifyForm || !verifyEmail || !verificationStep || !signupIntro || !authCard) {
            throw new Error("The email verification form could not be loaded. Please reload and try again.");
          }
          verifyEmail.value = email;
          authForm.reset();
          authForm.hidden = true;
          signupIntro.hidden = true;
          verificationStep.hidden = false;
          authCard.setAttribute("aria-labelledby", "verification-title");
          showAuthMessage(`We sent a verification code to ${email}. Enter it below to verify your account.`, "success");
        }
      } else if (formType === "password-reset") {
        result = await authClient.auth.resetPasswordForEmail(email, {
          redirectTo: new URL("reset-password.html", window.location.href).href
        });
        if (result.error) throw result.error;
        showAuthMessage("If an account exists for that address, a password reset link is on its way.", "success");
      } else if (formType === "password-update") {
        result = await authClient.auth.updateUser({
          password: String(formData.get("password") || "")
        });
        if (result.error) throw result.error;
        showAuthMessage("Password updated. You can now sign in with your new password.", "success");
        authForm.reset();
      }
    } catch (error) {
      showAuthMessage(error.message || "We couldn't complete that request. Please try again.");
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute("aria-busy");
    }
  });
}

const verificationForm = document.querySelector("#signup-verification-form");
if (verificationForm) {
  verificationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!authClient) {
      showSetupMessage();
      return;
    }

    const submitButton = verificationForm.querySelector('[type="submit"]');
    const email = verificationForm.querySelector("#verification-email").value.trim();
    const token = verificationForm.querySelector("#verification-code").value.trim();
    submitButton.disabled = true;
    submitButton.setAttribute("aria-busy", "true");
    if (authMessage) authMessage.hidden = true;

    try {
      const { data, error } = await authClient.auth.verifyOtp({
        email,
        token,
        type: "signup"
      });
      if (error) throw error;
      if (data.session) {
        window.location.assign("index.html");
      } else {
        showAuthMessage("Your email is verified. You can now sign in.", "success");
        window.location.assign("sign-in.html");
      }
    } catch (error) {
      showAuthMessage(error.message || "We couldn't verify that code. Check it and try again.");
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute("aria-busy");
    }
  });
}

const resendCodeButton = document.querySelector("#resend-verification-code");
if (resendCodeButton) {
  resendCodeButton.addEventListener("click", async () => {
    if (!authClient) {
      showSetupMessage();
      return;
    }

    const email = document.querySelector("#verification-email").value.trim();
    resendCodeButton.disabled = true;
    if (authMessage) authMessage.hidden = true;

    try {
      const { error } = await authClient.auth.resend({ type: "signup", email });
      if (error) throw error;
      showAuthMessage(`A new verification code was sent to ${email}.`, "success");
    } catch (error) {
      showAuthMessage(error.message || "We couldn't resend the code. Please try again.");
    } finally {
      resendCodeButton.disabled = false;
    }
  });
}

const recoveryRequest = document.querySelector("#password-reset-request");
const recoveryUpdate = document.querySelector("#password-reset-update");
if (recoveryRequest && recoveryUpdate && new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery") {
  recoveryRequest.hidden = true;
  recoveryUpdate.hidden = false;
}

const signOutButton = document.querySelector("#sign-out-button");
if (signOutButton) {
  signOutButton.addEventListener("click", async () => {
    if (!authClient) {
      showAuthMessage("Authentication is not configured yet.", "error");
      return;
    }
    signOutButton.disabled = true;
    const { error } = await authClient.auth.signOut();
    if (error) {
      showAuthMessage(error.message || "Could not sign out. Please try again.");
      signOutButton.disabled = false;
      return;
    }
    window.location.assign("sign-in.html");
  });
}

const accountLink = document.querySelector("#account-link");
if (accountLink) {
  if (!authClient) {
    window.location.replace("sign-in.html");
  } else {
    authClient.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      if (!data.session) {
        window.location.replace("sign-in.html");
        return;
      }

      accountLink.textContent = "My account";
      accountLink.href = "sign-in.html";
      if (signOutButton) signOutButton.hidden = false;
      accountLink.title = data.session.user.email || "Signed-in account";
      document.body.hidden = false;
    }).catch((error) => {
      console.error("Could not verify authentication session:", error.message);
      window.location.replace("sign-in.html");
    });
  }
}
