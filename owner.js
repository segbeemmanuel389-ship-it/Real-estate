(() => {
  const client = window.PACIFIC_SUPABASE_CLIENT;
  const dashboard = document.querySelector("#owner-dashboard");
  if (!dashboard) return;

  const message = document.querySelector("#owner-message");
  const form = document.querySelector("#listing-form");
  const listingsBody = document.querySelector("#owner-listings");
  const activityList = document.querySelector("#owner-activity");
  const submitButton = form.querySelector('[type="submit"]');
  const fields = ["title", "property_type", "transaction_type", "location", "price", "bedrooms", "description", "image_url"];

  function showMessage(text, kind = "error") {
    message.textContent = text;
    message.className = `account-message ${kind}`;
    message.hidden = false;
  }

  function setFormValue(name, value) {
    form.elements.namedItem(name).value = value ?? "";
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  }

  async function loadListings() {
    const { data, error } = await client
      .from("listings")
      .select("id,title,property_type,transaction_type,location,price,bedrooms,description,image_url,is_published,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;

    listingsBody.replaceChildren();
    for (const listing of data) {
      const row = document.createElement("tr");
      const titleCell = document.createElement("td");
      titleCell.textContent = listing.title;
      const locationCell = document.createElement("td");
      locationCell.textContent = listing.location;
      const statusCell = document.createElement("td");
      statusCell.textContent = listing.is_published ? "Published" : "Draft";
      const actionsCell = document.createElement("td");

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "owner-action";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => {
        fields.forEach((field) => setFormValue(field, listing[field]));
        form.elements.namedItem("id").value = listing.id;
        form.elements.namedItem("is_published").checked = listing.is_published;
        form.querySelector("h2").textContent = "Edit listing";
        submitButton.textContent = "Save changes";
        window.scrollTo({ top: 0, behavior: "smooth" });
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "owner-action danger";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", () => deleteListing(listing.id, listing.title, deleteButton));
      actionsCell.append(editButton, deleteButton);
      row.append(titleCell, locationCell, statusCell, actionsCell);
      listingsBody.append(row);
    }
  }

  async function loadActivity() {
    const { data, error } = await client
      .from("owner_activity")
      .select("action,listing_title,actor_id,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    activityList.replaceChildren();
    if (data.length === 0) {
      const empty = document.createElement("li");
      empty.textContent = "No listing activity yet.";
      activityList.append(empty);
      return;
    }
    for (const activity of data) {
      const item = document.createElement("li");
      const description = document.createElement("strong");
      description.textContent = `${activity.action[0].toUpperCase()}${activity.action.slice(1)}: ${activity.listing_title}`;
      const detail = document.createElement("span");
      detail.textContent = `${formatDate(activity.created_at)} · ${activity.actor_id ? `Owner ${activity.actor_id.slice(0, 8)}` : "Owner"}`;
      item.append(description, detail);
      activityList.append(item);
    }
  }

  async function refreshDashboard() {
    await Promise.all([loadListings(), loadActivity()]);
  }

  async function deleteListing(id, title, button) {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    button.disabled = true;
    let deleted = false;
    try {
      const { error } = await client.from("listings").delete().eq("id", id);
      if (error) throw error;
      deleted = true;
      await refreshDashboard();
      showMessage("Listing deleted.", "success");
    } catch (error) {
      button.disabled = false;
      showMessage(deleted
        ? `Listing deleted, but the dashboard could not refresh: ${error.message}`
        : `Could not delete listing: ${error.message}`);
    }
  }

  function resetForm() {
    form.reset();
    form.elements.namedItem("id").value = "";
    form.elements.namedItem("is_published").checked = true;
    form.querySelector("h2").textContent = "Add a listing";
    submitButton.textContent = "Create listing";
  }

  document.querySelector("#cancel-edit").addEventListener("click", resetForm);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const imageUrl = String(formData.get("image_url") || "").trim();
    let parsedImageUrl;
    try {
      parsedImageUrl = new URL(imageUrl);
    } catch {
      showMessage("Please enter a valid secure HTTPS image URL.");
      return;
    }
    if (parsedImageUrl.protocol !== "https:") {
      showMessage("Please use a secure HTTPS image URL.");
      return;
    }

    const listing = {
      title: String(formData.get("title")).trim(),
      property_type: String(formData.get("property_type")),
      transaction_type: String(formData.get("transaction_type")),
      location: String(formData.get("location")).trim(),
      price: Number(formData.get("price")),
      bedrooms: Number(formData.get("bedrooms") || 0),
      description: String(formData.get("description") || "").trim(),
      image_url: imageUrl,
      is_published: form.elements.namedItem("is_published").checked
    };
    const id = String(formData.get("id") || "");
    submitButton.disabled = true;

    let saved = false;
    try {
      const result = id
        ? await client.from("listings").update(listing).eq("id", id)
        : await client.from("listings").insert(listing);
      if (result.error) throw result.error;
      saved = true;
      resetForm();
      await refreshDashboard();
      showMessage(id ? "Listing updated." : "Listing created.", "success");
    } catch (error) {
      showMessage(saved
        ? `Listing saved, but the dashboard could not refresh: ${error.message}`
        : `Could not save listing: ${error.message}`);
    } finally {
      submitButton.disabled = false;
    }
  });

  async function initialize() {
    if (!client) throw new Error("Supabase is not configured.");
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) {
      window.location.replace("../login/");
      return;
    }
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    if (!data.user) {
      window.location.replace("../login/");
      return;
    }
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== "owner") {
      window.location.replace("../profile/");
      return;
    }
    document.querySelector("#owner-loading").hidden = true;
    document.querySelector("[data-sign-out]").hidden = false;
    dashboard.hidden = false;
    await refreshDashboard();
  }

  initialize().catch((error) => {
    console.error("Could not load the owner dashboard:", error.message);
    document.querySelector("#owner-loading").textContent =
      "Owner access could not be verified. Please sign in with an owner account and ensure the database setup is complete.";
    message.hidden = false;
    showMessage(`Could not load the owner dashboard: ${error.message}`);
  });
})();
