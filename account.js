(() => {
  const client = window.PACIFIC_SUPABASE_CLIENT;
  const accountScript = [...document.scripts].find((script) => script.src.endsWith("/account.js"));
  const siteRoot = accountScript ? new URL(".", accountScript.src) : new URL("./", window.location.href);
  const siteUrl = (path = "") => new URL(path, siteRoot).href;

  function showAccountMessage(message, kind = "error") {
    const messageElement = document.querySelector(".account-message");
    if (!messageElement) {
      console.error(message);
      return;
    }

    messageElement.textContent = message;
    messageElement.className = `account-message ${kind}`;
    messageElement.hidden = false;
  }

  function isProfilesTableMissing(error) {
    return error?.code === "PGRST205"
      || error?.code === "42P01"
      || error?.message?.includes("public.profiles");
  }

  async function signedInUser() {
    if (!client) throw new Error("Authentication is not configured.");
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) return null;
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    return data.user;
  }

  async function setAccountNavigation() {
    const accountLink = document.querySelector("#account-link");
    const signOutButton = document.querySelector("#sign-out-button");
    if (!accountLink || !client) return;

    const { data, error } = await client.auth.getSession();
    if (error) {
      console.error("Could not load the authentication session:", error.message);
      return;
    }
    if (!data.session) return;

    accountLink.textContent = "My profile";
    accountLink.href = siteUrl("profile/");
    accountLink.title = data.session.user.email || "Signed-in account";
    if (signOutButton) signOutButton.hidden = false;

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("role")
      .eq("id", data.session.user.id)
      .maybeSingle();
    if (profileError) {
      console.error("Could not load the account role:", profileError.message);
      return;
    }
    if (profile?.role === "owner") {
      accountLink.textContent = "Owner dashboard";
      accountLink.href = siteUrl("owner/");
    }
  }

  document.querySelectorAll("[data-sign-out]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!client) {
        showAccountMessage("Authentication is not configured.");
        return;
      }
      button.disabled = true;
      const { error } = await client.auth.signOut();
      if (error) {
        button.disabled = false;
        showAccountMessage(`Could not sign out: ${error.message}`);
        return;
      }
      window.location.assign(siteUrl("login/?loggedOut=1"));
    });
  });

  const signUpForm = document.querySelector("#signup-form");
  if (signUpForm) {
    signUpForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!client) {
        showAccountMessage("Authentication is not configured. Please contact the site administrator.");
        return;
      }

      const formData = new FormData(signUpForm);
      const name = String(formData.get("name") || "").trim();
      const email = String(formData.get("email") || "").trim().toLowerCase();
      const password = String(formData.get("password") || "");
      const submitButton = signUpForm.querySelector('[type="submit"]');
      submitButton.disabled = true;

      try {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
            emailRedirectTo: siteUrl("login/?verified=1")
          }
        });
        if (error) throw error;
        if (data.session) {
          const { error: signOutError } = await client.auth.signOut({ scope: "local" });
          if (signOutError) {
            throw new Error(`Email confirmation is disabled, and the new session could not be closed: ${signOutError.message}`);
          }
          showAccountMessage("Your account was created, but email confirmation is disabled. Please contact the site administrator to enable email confirmations before signing in.");
        } else {
          showAccountMessage(`Verification email sent to ${email}. Check your inbox (and spam folder) and verify your email before signing in.`, "success");
          signUpForm.reset();
        }
      } catch (error) {
        showAccountMessage(`Could not create your account: ${error.message}`);
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  const loginForm = document.querySelector("#login-form");
  if (loginForm) {
    const params = new URLSearchParams(window.location.search);
    if (params.has("loggedOut")) {
      showAccountMessage("You have been signed out.", "success");
    }
    if (params.has("registered")) {
      showAccountMessage("Account created. Check your email to verify your account before signing in.", "success");
    }
    if (params.has("verified")) {
      showAccountMessage("Email verified. Sign in to access your account.", "success");
    }

    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!client) {
        showAccountMessage("Authentication is not configured. Please contact the site administrator.");
        return;
      }

      const formData = new FormData(loginForm);
      const email = String(formData.get("email") || "").trim().toLowerCase();
      const password = String(formData.get("password") || "");
      const submitButton = loginForm.querySelector('[type="submit"]');
      submitButton.disabled = true;

      try {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.assign(siteUrl());
      } catch (error) {
        showAccountMessage(`Could not sign in: ${error.message}`);
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  const profilePage = document.querySelector("#profile-page");
  if (profilePage) {
    (async () => {
      try {
        const user = await signedInUser();
        if (!user) {
          window.location.replace(siteUrl("login/"));
          return;
        }
        document.querySelector("#profile-name").textContent =
          user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
        document.querySelector("#profile-email").textContent = user.email || "";

        const { data: profile, error } = await client
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle();
        if (error) {
          if (!isProfilesTableMissing(error)) throw error;
          showAccountMessage(
            "Your account details are available. To enable user and owner roles, the site administrator needs to run supabase/schema.sql in the Supabase SQL Editor.",
            "warning"
          );
          return;
        }
        if (profile?.full_name) {
          document.querySelector("#profile-name").textContent = profile.full_name;
        }
      } catch (error) {
        showAccountMessage(`Could not load your profile: ${error.message}`);
      }
    })();
  }

  setAccountNavigation().catch((error) => {
    console.error("Could not load account navigation:", error.message);
  });
})();
