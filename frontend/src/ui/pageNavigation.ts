export type PageId = "modern" | "production";

type NavItem = {
  id: PageId;
  href: string;
  label: string;
  title: string;
};

const NAV_ITEMS: NavItem[] = [
  {
    id: "modern",
    href: "/",
    label: "Dashboard",
    title: "Open Modern Dashboard"
  },
  {
    id: "production",
    href: "/production.html",
    label: "Production",
    title: "Open Production Dashboard"
  }
];

export function renderHeaderNavigation(activePage: PageId): string {
  return NAV_ITEMS.map((item) => {
    const classes = ["btn", "btn-sm", "btn-secondary"];
    if (item.id === activePage) {
      classes.push("active");
    }

    const attributes = [
      `class="${classes.join(" ")}"`,
      `href="${item.href}"`,
      `title="${item.title}"`
    ];

    if (item.id === activePage) {
      attributes.push('aria-current="page"');
    }

    return `<a ${attributes.join(" ")}>${item.label}</a>`;
  }).join("\n");
}

export function renderFooterNavigation(activePage: PageId): string {
  return NAV_ITEMS.map((item) => {
    const attributes = [`href="${item.href}"`];
    if (item.id === activePage) {
      attributes.push('aria-current="page"');
      attributes.push('class="active"');
    }

    return `<a ${attributes.join(" ")}>${item.label}</a>`;
  }).join("\n            <span>•</span>\n            ");
}
