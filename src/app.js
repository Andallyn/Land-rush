const sources = [
  {
    icon: "K",
    name: "Keyword Search",
    status: "Always on",
    description:
      "Track high-intent Google and web phrases for land to buy, lease, inspect, farm, develop, or flip.",
    tags: ["Google Alerts", "SEO pages", "search trends"],
  },
  {
    icon: "R",
    name: "Subreddits",
    status: "API ready",
    description:
      "Monitor geography and investment communities where people ask about land, agriculture, relocation, and deals.",
    tags: ["r/Nigeria", "r/RealEstate", "r/farming"],
  },
  {
    icon: "S",
    name: "Social Media",
    status: "Listening",
    description:
      "Collect public comments and posts from X, Facebook groups, TikTok comments, LinkedIn, and Instagram.",
    tags: ["hashtags", "comments", "DM prompts"],
  },
  {
    icon: "F",
    name: "Forums",
    status: "Queued",
    description:
      "Watch Nairaland, local business forums, diaspora groups, and agriculture boards for buying or leasing demand.",
    tags: ["Nairaland", "Quora", "community boards"],
  },
  {
    icon: "P",
    name: "Property Sites",
    status: "Partner feed",
    description:
      "Compare market demand from popular listing sites and capture users who cannot find verified listings.",
    tags: ["market gaps", "price signals", "listing alerts"],
  },
  {
    icon: "W",
    name: "WhatsApp & Referrals",
    status: "Capture",
    description:
      "Turn agent referrals, broadcast replies, and click-to-chat campaigns into structured customer records.",
    tags: ["chatbot", "broadcasts", "agent links"],
  },
];

const feedItems = [
  {
    title: "Lease request: 3 acres near Abeokuta",
    source: "Facebook farming group",
    intent: "Lease",
  },
  {
    title: "Buyer asking for titled plots in Lekki corridor",
    source: "Keyword search",
    intent: "Buy",
  },
  {
    title: "Investor looking for urgent land sale in Ibadan",
    source: "Nairaland thread",
    intent: "Distress Sale",
  },
];

let leads = [
  {
    name: "Tunde Adebayo",
    intent: "Lease",
    location: "Epe, Lagos",
    budget: "₦900k yearly",
    size: "5 acres",
    source: "Google keyword: farmland for lease in Epe",
    timeline: "Inspection this week",
    notes: "Poultry expansion, wants road access and water source.",
    score: 92,
  },
  {
    name: "Miriam Mensah",
    intent: "Buy",
    location: "Accra outskirts",
    budget: "GHS 220k",
    size: "2 plots",
    source: "Facebook group comment",
    timeline: "Ready to speak to verified owner",
    notes: "Needs documents verified before site visit.",
    score: 86,
  },
  {
    name: "Chinedu Obi",
    intent: "Distress Sale",
    location: "Ibadan, Oyo",
    budget: "₦8m cash",
    size: "1 acre+",
    source: "Nairaland investment forum",
    timeline: "48-hour decision window",
    notes: "Land flipper looking below market value.",
    score: 95,
  },
  {
    name: "Aisha Bello",
    intent: "Lease",
    location: "Kaduna",
    budget: "₦1.5m per season",
    size: "10 acres",
    source: "Reddit agriculture thread",
    timeline: "Next planting season",
    notes: "Needs irrigation and vehicle access for maize farming.",
    score: 78,
  },
  {
    name: "Kojo Appiah",
    intent: "Buy",
    location: "Kumasi",
    budget: "GHS 350k",
    size: "Half acre",
    source: "Property-site comparison alert",
    timeline: "Needs shortlist",
    notes: "Developer comparing verified plots around growth corridors.",
    score: 81,
  },
  {
    name: "Grace Udo",
    intent: "Lease",
    location: "Uyo",
    budget: "₦600k yearly",
    size: "Fish pond facility",
    source: "WhatsApp referral",
    timeline: "Inspection next weekend",
    notes: "Looking for existing ponds with road access and electricity.",
    score: 84,
  },
];

const state = {
  filter: "all",
  query: "",
};

const sourceGrid = document.querySelector("#sourceGrid");
const miniFeed = document.querySelector("#miniFeed");
const leadGrid = document.querySelector("#leadGrid");
const statsRow = document.querySelector("#statsRow");
const filterButtons = document.querySelectorAll(".filter-button");
const leadSearch = document.querySelector("#leadSearch");
const leadForm = document.querySelector("#leadForm");
const formStatus = document.querySelector("#formStatus");
const heroLeadCount = document.querySelector("#heroLeadCount");

function renderSources() {
  sourceGrid.innerHTML = sources
    .map(
      (source) => `
        <article class="source-card">
          <header>
            <span class="source-icon">${source.icon}</span>
            <span class="source-status">${source.status}</span>
          </header>
          <h3>${source.name}</h3>
          <p>${source.description}</p>
          <div class="tag-list">
            ${source.tags.map((tag) => `<span>${tag}</span>`).join("")}
          </div>
        </article>
      `,
    )
    .join("");
}

function renderMiniFeed() {
  miniFeed.innerHTML = feedItems
    .map(
      (item) => `
        <div class="mini-feed-item">
          <strong>${item.title}</strong>
          <small>${item.source} • ${item.intent}</small>
        </div>
      `,
    )
    .join("");
}

function getFilteredLeads() {
  return leads.filter((lead) => {
    const matchesFilter = state.filter === "all" || lead.intent === state.filter;
    const haystack = `${lead.name} ${lead.intent} ${lead.location} ${lead.budget} ${lead.size} ${lead.source} ${lead.notes}`
      .toLowerCase()
      .trim();
    const matchesQuery = haystack.includes(state.query.toLowerCase().trim());

    return matchesFilter && matchesQuery;
  });
}

function getLeadAction(lead) {
  if (lead.score >= 90) {
    return "Call now, confirm documents needed, and book inspection slot.";
  }

  if (lead.intent === "Lease") {
    return "Send matching lease listings and ask for preferred inspection date.";
  }

  if (lead.intent === "Distress Sale") {
    return "Route to investment desk and validate proof of funds.";
  }

  return "Send verified shortlist and safety advisory before inspection.";
}

function renderLeads() {
  const filteredLeads = getFilteredLeads();

  leadGrid.innerHTML = filteredLeads.length
    ? filteredLeads
        .map((lead) => {
          const intentClass = lead.intent === "Distress Sale" ? "Distress" : lead.intent;

          return `
            <article class="lead-card">
              <div>
                <div class="lead-topline">
                  <div>
                    <span class="lead-type ${intentClass}">${lead.intent}</span>
                    <h3>${lead.name}</h3>
                  </div>
                  <span class="lead-score">${lead.score}</span>
                </div>
                <p>${lead.notes}</p>
                <div class="lead-meta">
                  <span>${lead.location}</span>
                  <span>${lead.budget}</span>
                  <span>${lead.size}</span>
                  <span>${lead.timeline}</span>
                </div>
                <p><strong>Source:</strong> ${lead.source}</p>
              </div>
              <div class="lead-action">${getLeadAction(lead)}</div>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state">No leads match this view. Try another filter or add a new lead.</div>`;
}

function renderStats() {
  const leaseCount = leads.filter((lead) => lead.intent === "Lease").length;
  const buyCount = leads.filter((lead) => lead.intent === "Buy").length;
  const distressCount = leads.filter((lead) => lead.intent === "Distress Sale").length;
  const hotCount = leads.filter((lead) => lead.score >= 85).length;
  const stats = [
    { label: "Total leads", value: leads.length },
    { label: "Lease demand", value: leaseCount },
    { label: "Buy demand", value: buyCount },
    { label: "Hot leads", value: hotCount + distressCount },
  ];

  statsRow.innerHTML = stats
    .map(
      (stat) => `
        <div class="stat-card">
          <strong>${stat.value}</strong>
          <span>${stat.label}</span>
        </div>
      `,
    )
    .join("");

  heroLeadCount.textContent = leads.length + 36;
}

function calculateScore(formData) {
  let score = 42;
  const budget = formData.get("budget").toString().trim();
  const location = formData.get("location").toString().trim();
  const size = formData.get("size").toString().trim();
  const notes = formData.get("notes").toString().toLowerCase();
  const intent = formData.get("intent");

  if (location.length > 3) score += 16;
  if (budget.length > 2) score += 14;
  if (size.length > 1) score += 10;
  if (notes.includes("inspect") || notes.includes("inspection") || notes.includes("visit")) score += 12;
  if (notes.includes("urgent") || notes.includes("cash") || notes.includes("ready")) score += 10;
  if (intent === "Distress Sale") score += 8;

  return Math.min(score, 98);
}

function renderAll() {
  renderStats();
  renderLeads();
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    filterButtons.forEach((currentButton) => currentButton.classList.remove("active"));
    button.classList.add("active");
    state.filter = button.dataset.filter;
    renderLeads();
  });
});

leadSearch.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderLeads();
});

leadForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(leadForm);
  const newLead = {
    name: formData.get("name").toString().trim(),
    intent: formData.get("intent"),
    location: formData.get("location").toString().trim(),
    budget: formData.get("budget").toString().trim(),
    size: formData.get("size").toString().trim(),
    source: "Manual capture form",
    timeline: "New inbound",
    notes:
      formData.get("notes").toString().trim() ||
      "New customer captured from Landrush demand form. Needs qualification call.",
    score: calculateScore(formData),
  };

  leads = [newLead, ...leads];
  leadForm.reset();
  formStatus.textContent = `${newLead.name} was added to the demand pipeline with a score of ${newLead.score}.`;
  state.filter = "all";
  state.query = "";
  leadSearch.value = "";
  filterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === "all");
  });
  renderAll();
  document.querySelector("#pipeline").scrollIntoView({ behavior: "smooth" });
});

renderSources();
renderMiniFeed();
renderAll();
