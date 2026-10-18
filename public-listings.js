(() => {
  const client = window.PACIFIC_SUPABASE_CLIENT;
  const grids = [...document.querySelectorAll("[data-public-listings]")];
  if (grids.length === 0) return;
  if (!client) {
    console.error("Could not load published listings: Supabase is not configured.");
    document.querySelectorAll("[data-listings-error]").forEach((message) => {
      message.hidden = false;
    });
    return;
  }

  const money = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  });

  function makeListingCard(listing) {
    const card = document.createElement("article");
    card.className = "property-card";
    card.dataset.mode = listing.transaction_type;
    card.dataset.type = listing.property_type;
    card.dataset.bedrooms = String(listing.bedrooms || 0);
    card.dataset.price = String(listing.price);
    card.dataset.location = listing.location;

    const imageLink = document.createElement("div");
    imageLink.className = "property-image";
    const image = document.createElement("img");
    image.src = listing.image_url;
    image.alt = listing.title;
    image.loading = "lazy";
    imageLink.append(image);

    const tag = document.createElement("span");
    tag.className = "image-tag";
    tag.textContent = listing.transaction_type === "Rent"
      ? "FOR RENT"
      : listing.transaction_type === "Short Let"
        ? "SHORT LET"
        : listing.transaction_type === "Land" ? "LAND FOR SALE" : "FOR SALE";
    imageLink.append(tag);

    const info = document.createElement("div");
    info.className = "property-info";
    const priceLine = document.createElement("div");
    priceLine.className = "price-line";
    const price = document.createElement("strong");
    price.textContent = money.format(listing.price);
    priceLine.append(price);

    const title = document.createElement("h3");
    title.textContent = listing.title;
    const location = document.createElement("p");
    location.className = "property-location";
    location.textContent = listing.location;
    const meta = document.createElement("div");
    meta.className = "property-meta";
    meta.textContent = listing.bedrooms > 0
      ? `${listing.bedrooms} beds · ${listing.property_type}`
      : listing.property_type;
    info.append(priceLine, title, location, meta);
    if (listing.description) {
      const description = document.createElement("p");
      description.className = "property-details";
      description.textContent = listing.description;
      info.append(description);
    }
    card.append(imageLink, info);
    return card;
  }

  async function loadListings() {
    const { data, error } = await client
      .from("listings")
      .select("id,title,property_type,transaction_type,location,price,bedrooms,description,image_url")
      .eq("is_published", true)
      .order("created_at", { ascending: false });
    if (error) throw error;

    for (const listing of data) {
      grids.forEach((grid) => grid.append(makeListingCard(listing)));
    }
  }

  loadListings().catch((error) => {
    console.error("Could not load published listings:", error.message);
    document.querySelectorAll("[data-listings-error]").forEach((message) => {
      message.hidden = false;
    });
  });
})();
