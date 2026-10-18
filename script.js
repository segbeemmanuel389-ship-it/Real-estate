const searchForm = document.querySelector("#property-search");
const searchTabs = [...document.querySelectorAll(".search-tab")];
const recentSection = document.querySelector("#recent");
const emptyState = document.querySelector(".empty-state");
let activeMode = "Buy";

function setMode(mode) {
  activeMode = mode;
  searchTabs.forEach((tab) => {
    const selected = tab.dataset.mode === mode;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  document.querySelector("#property-type").value = mode === "Land" ? "Land" : "";
}

searchTabs.forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));

document.querySelectorAll("[data-search-mode]").forEach((link) => {
  link.addEventListener("click", () => setMode(link.dataset.searchMode));
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const location = document.querySelector("#location").value.trim().toLowerCase();
  const type = document.querySelector("#property-type").value;
  const bedrooms = Number(document.querySelector("#bedrooms").value || 0);
  const minPrice = Number(document.querySelector("#min-price").value || 0);
  const maxPrice = Number(document.querySelector("#max-price").value || Infinity);
  let visibleCount = 0;

  document.querySelectorAll("#recent .property-card").forEach((card) => {
    const cardPrice = Number(card.dataset.price);
    const matches = card.dataset.mode === activeMode
      && (!location || card.dataset.location.toLowerCase().includes(location))
      && (!type || card.dataset.type === type)
      && Number(card.dataset.bedrooms) >= bedrooms
      && cardPrice >= minPrice
      && cardPrice <= maxPrice;
    card.hidden = !matches;
    if (matches) visibleCount += 1;
  });

  recentSection.hidden = false;
  emptyState.hidden = visibleCount > 0;
  recentSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelectorAll(".save-button").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const saved = button.classList.toggle("saved");
    button.textContent = saved ? "♥" : "♡";
    button.setAttribute("aria-label", saved ? "Remove saved property" : "Save property");
  });
});

document.querySelectorAll(".video-sound-toggle").forEach((button) => {
  const video = button.closest(".video-home-card")?.querySelector("video");
  if (!video) return;

  video.muted = false;
  video.volume = 1;

  const updateSoundButton = () => {
    const label = video.muted ? "Turn sound on" : "Mute sound";
    button.textContent = label;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(!video.muted));
  };

  video.addEventListener("volumechange", updateSoundButton);
  button.addEventListener("click", () => {
    video.muted = !video.muted;
  });
  updateSoundButton();
});

const menuButton = document.querySelector(".menu-toggle");
const mainNav = document.querySelector(".main-nav");
menuButton.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") !== "true";
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  mainNav.classList.toggle("open", open);
});

mainNav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    mainNav.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Open navigation");
  });
});

const consultationForm = document.querySelector("#consultation-form");
const consultationWhatsAppNumber = "2347065239666";
const consultationResult = document.querySelector("#consultation-result");

function showConsultationResult(message, kind, links = []) {
  consultationResult.replaceChildren(document.createTextNode(message));
  links.forEach(({ href, label }) => {
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = ` ${label}`;
    consultationResult.append(link);
  });
  consultationResult.className = `consultation-result ${kind}`;
  consultationResult.hidden = false;
}

async function consultationError(error) {
  const response = error?.context;
  if (response instanceof Response) {
    try {
      const details = await response.clone().json();
      if (typeof details?.error === "string") return details.error;
    } catch (parseError) {
      console.error("Could not read the consultation submission error:", parseError);
    }
    if (response.status === 404) {
      return "The consultation service is not deployed yet. Please try again later.";
    }
  }
  return "We could not confirm that your request was saved. Please try again or contact us directly.";
}

consultationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(consultationForm);
  const request = {
    firstName: String(formData.get("firstName") || "").trim(),
    lastName: String(formData.get("lastName") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    interest: String(formData.get("interest") || "").trim(),
    message: String(formData.get("message") || "").trim(),
    website: String(formData.get("website") || "").trim()
  };
  const message = [
    "Consultation request",
    `Name: ${request.firstName} ${request.lastName}`,
    `Email: ${request.email}`,
    `Phone: ${request.phone}`,
    `Interest: ${request.interest}`,
    "",
    request.message
  ].join("\n");
  const whatsappUrl = `https://wa.me/${consultationWhatsAppNumber}?text=${encodeURIComponent(message)}`;
  const whatsappWindow = window.open(whatsappUrl, "_blank");
  if (whatsappWindow) whatsappWindow.opener = null;

  const submitButton = consultationForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  submitButton.setAttribute("aria-busy", "true");
  consultationResult.hidden = true;
  try {
    const client = window.PACIFIC_SUPABASE_CLIENT;
    if (!client) throw new Error("Supabase is not configured.");
    const { error } = await client.functions.invoke("consultation-email", { body: request });
    if (error) throw error;
    showConsultationResult(
      whatsappWindow
        ? "WhatsApp is open with your message. Your consultation was securely saved and emailed to the property owner."
        : "Your consultation was securely saved and emailed to the property owner, but your browser blocked the WhatsApp window.",
      "success",
      whatsappWindow ? [] : [{ href: whatsappUrl, label: "Open WhatsApp" }]
    );
    consultationForm.reset();
  } catch (error) {
    console.error("Could not submit consultation request:", error.message);
    showConsultationResult(
      await consultationError(error),
      "error",
      [
        ...(!whatsappWindow ? [{ href: whatsappUrl, label: "Open WhatsApp" }] : [])
      ]
    );
  } finally {
    submitButton.disabled = false;
    submitButton.removeAttribute("aria-busy");
  }
});
