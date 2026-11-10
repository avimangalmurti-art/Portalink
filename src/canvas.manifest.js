export const manifest = {
  screens: {
    scr_aedyru: { name: "Home", route: "/", state: { "activeDestination": "Today" }, position: { "x": 160, "y": 220 } },
    scr_kt0q8b: { name: "Browse", route: "/", state: { "isSearchOpen": true }, position: { "x": 1560, "y": 220 } },
    scr_l1osk8: { name: "Dark Academia collection", route: "/", state: { "isSearchOpen": true, "selectedCategory": "Dark Academia" }, position: { "x": 160, "y": 2200 } },
    scr_us7bd2: { name: "Palo workspace", route: "/", state: { "isPlatformAIOpen": true }, position: { "x": 1560, "y": 2200 } },
    scr_cbdbey: { name: "Avi · Graphic Design (visitor)", route: "/", state: { "viewedProfileId": "avi", "activeCategoryId": "graphic-design" }, position: { "x": 160, "y": 4180 } },
    scr_614ifo: { name: "Avi · Photography", route: "/", state: { "viewedProfileId": "avi", "activeCategoryId": "photography" }, position: { "x": 1560, "y": 4180 } },
    scr_98xaw0: { name: "Avi · User Interface Design", route: "/", state: { "viewedProfileId": "avi", "activeCategoryId": "user-interface-design" }, position: { "x": 2960, "y": 4180 } },
    scr_rs9ks3: { name: "Project · Cool, Calm and Collected", route: "/", state: { "viewedProfileId": "avi", "activeCategoryId": "graphic-design", "activeProjectId": "cool-calm-and-collected" }, position: { "x": 160, "y": 6160 } },
    scr_3pzmhg: { name: "Avi Mangalmurti profile", route: "/", state: { "viewedProfileId": "avi", "overviewProfileId": "avi" }, position: { "x": 160, "y": 8140 } },
    scr_6uprzk: { name: "Studio Luma profile", route: "/", state: { "viewedProfileId": "studio-luma", "overviewProfileId": "studio-luma" }, position: { "x": 1560, "y": 8140 } },
    scr_h9xa05: { name: "Product · Overview", route: "/", state: { "selectedApp": { "name": "Keinemusik Logo T-shirt", "tagline": "Heavyweight cotton", "icon": "" }, "productDetailView": "overview" }, position: { "x": 160, "y": 12100 } },
    scr_9p229m: { name: "Product · Highlights", route: "/", state: { "selectedApp": { "name": "Keinemusik Logo T-shirt", "tagline": "Heavyweight cotton", "icon": "" }, "productDetailView": "highlights" }, position: { "x": 1560, "y": 12100 } },
    scr_llfpsv: { name: "Product · Designer notes", route: "/", state: { "selectedApp": { "name": "Keinemusik Logo T-shirt", "tagline": "Heavyweight cotton", "icon": "" }, "productDetailView": "designer" }, position: { "x": 2960, "y": 12100 } },
    scr_hjgaqu: { name: "Product · Colours", route: "/", state: { "selectedApp": { "name": "Keinemusik Logo T-shirt", "tagline": "Heavyweight cotton", "icon": "" }, "productDetailView": "colours" }, position: { "x": 4360, "y": 12100 } },
    scr_xrpyk1: { name: "Product · Size & fit", route: "/", state: { "selectedApp": { "name": "Keinemusik Logo T-shirt", "tagline": "Heavyweight cotton", "icon": "" }, "productDetailView": "sizing" }, position: { "x": 5760, "y": 12100 } },
    scr_zxv99h: { name: "Product · Materials & care", route: "/", state: { "selectedApp": { "name": "Keinemusik Logo T-shirt", "tagline": "Heavyweight cotton", "icon": "" }, "productDetailView": "materials" }, position: { "x": 7160, "y": 12100 } },
    scr_04t0b9: { name: "Product · Reviews", route: "/", state: { "selectedApp": { "name": "Keinemusik Logo T-shirt", "tagline": "Heavyweight cotton", "icon": "" }, "productDetailView": "reviews" }, position: { "x": 8560, "y": 12100 } },
    scr_keit2h: { name: "Product · Shipping & returns", route: "/", state: { "selectedApp": { "name": "Keinemusik Logo T-shirt", "tagline": "Heavyweight cotton", "icon": "" }, "productDetailView": "shipping" }, position: { "x": 9960, "y": 12100 } }
  },
  sections: {
    sec_5d7rdo: { name: "Main navigation", x: 0, y: 0, width: 2920, height: 1180 },
    sec_hwyffk: { name: "Discovery", x: 0, y: 1980, width: 2920, height: 1180 },
    sec_0y855t: { name: "Creator catalogue", x: 0, y: 3960, width: 4320, height: 1180 },
    sec_0tbpmh: { name: "Project catalogue", x: 0, y: 5940, width: 1520, height: 1180 },
    sec_sxnenk: { name: "Creator profile", x: 0, y: 7920, width: 2920, height: 1180 },
    sec_pmpmdp: { name: "Creator shop", x: 0, y: 9900, width: 4320, height: 1180 },
    sec_pzgyfr: { name: "Product details", x: 0, y: 11880, width: 11320, height: 1180 },
    sec_gs48ga: { name: "Settings", x: 0, y: 13860, width: 2920, height: 1180 }
  },
  layers: [
  { kind: "section", id: "sec_5d7rdo", children: [
    { kind: "screen", id: "scr_aedyru" },
    { kind: "screen", id: "scr_kt0q8b" }]
  },
  { kind: "section", id: "sec_hwyffk", children: [
    { kind: "screen", id: "scr_l1osk8" },
    { kind: "screen", id: "scr_us7bd2" }]
  },
  { kind: "section", id: "sec_0y855t", children: [
    { kind: "screen", id: "scr_cbdbey" },
    { kind: "screen", id: "scr_614ifo" },
    { kind: "screen", id: "scr_98xaw0" }]
  },
  { kind: "section", id: "sec_0tbpmh", children: [
    { kind: "screen", id: "scr_rs9ks3" }]
  },
  { kind: "section", id: "sec_sxnenk", children: [
    { kind: "screen", id: "scr_3pzmhg" },
    { kind: "screen", id: "scr_6uprzk" }]
  },
  { kind: "section", id: "sec_pmpmdp", children: [] },
  { kind: "section", id: "sec_pzgyfr", children: [
    { kind: "screen", id: "scr_h9xa05" },
    { kind: "screen", id: "scr_9p229m" },
    { kind: "screen", id: "scr_llfpsv" },
    { kind: "screen", id: "scr_hjgaqu" },
    { kind: "screen", id: "scr_xrpyk1" },
    { kind: "screen", id: "scr_zxv99h" },
    { kind: "screen", id: "scr_04t0b9" },
    { kind: "screen", id: "scr_keit2h" }]
  },
  { kind: "section", id: "sec_gs48ga", children: [
    { kind: "screen", id: "scr_sn55rc" },
    { kind: "screen", id: "scr_h7tmzm" }]
  }]

};