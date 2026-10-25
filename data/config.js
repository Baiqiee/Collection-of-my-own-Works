/* 白道奇个人作品集 · 站点配置
   改文案、改分类、改置顶，基本都在这个文件里。 */

window.PORTFOLIO = {
  owner: "baiqiee",
  email: "b18582505605@gmail.com",
  github: "https://github.com/baiqiee",

  /* 前端缓存时长：10 分钟。GitHub 匿名接口每小时 60 次/IP，缓存是必需的。 */
  cacheKey: "bdq-portfolio-repos-v1",
  cacheTTL: 10 * 60 * 1000,

  /* 自动封面：作品出现在页面上时，自动抓取该项目 README 里的第一张截图当封面。
     抓到的地址缓存 24 小时；徽章（shields 之类）会被跳过，优先静态截图、其次 gif。
     想给某个项目锁死自己的封面，在 meta 里加 autoCover: false；全局关掉就设成 false。 */
  autoCover: true,

  /* 分类。顺序即筛选标签顺序，数量为 0 的自动隐藏。 */
  categories: [
    { id: "game", label: "游戏", color: "#22d3ee" },
    { id: "app", label: "App", color: "#38bdf8" },
    { id: "web", label: "网页", color: "#2dd4bf" },
    { id: "tool", label: "工具", color: "#a78bfa" }
  ],

  /* 自动分类规则：仓库名 > topics > 描述 > 主语言，按顺序命中即停。 */
  rules: [
    { id: "game", keywords: ["game", "游戏", "godot", "unity", "gdscript", "phaser", "pygame", "cocos", "unreal", "demo"] },
    { id: "app", keywords: ["app", "应用", "小程序", "flutter", "react-native", "electron", "android", "ios", "expo", "uni-app"] },
    { id: "web", keywords: ["web", "网页", "网站", "html", "css", "vue", "react", "next", "nuxt", "site", "portfolio", "blog"] },
    { id: "tool", keywords: ["tool", "cli", "script", "工具", "算法", "leetcode", "util", "sdk", "bot"] }
  ],

  languageCategory: {
    GDScript: "game",
    "C#": "game",
    HTML: "web",
    CSS: "web",
    Vue: "web",
    JavaScript: "web",
    TypeScript: "web",
    Python: "tool",
    "C++": "tool",
    Java: "tool"
  },

  /* 单个项目的覆盖配置：分类、展示名、简介、置顶、封面截图、在线试玩地址。
     cover：兜底封面（assets/covers/ 下）。默认封面由 README 首图自动覆盖，
            想锁死这一张就在该项目里加 autoCover: false。
     demo：项目在线试玩地址（workbuddy.host 域名），留空则不显示播放键。 */
  meta: {
    slimpal: {
      title: "SlimPal",
      category: "app",
      pinned: true,
      cover: "assets/covers/slimpal-home.png",
      demo: "",
      desc: "完全离线的减肥陪伴 App，记录饮食、称重、写日记，虚拟角色「小克」跟着你的真实数据变化。"
    },
    "GameDemo-01": {
      title: "REBOOT",
      category: "game",
      cover: "assets/covers/gamedemo-title.png",
      demo: "https://reboot-game.app.workbuddy.host",
      desc: "关于解体与重组的 2D 短流程游戏，每摔死一次，就从自己的残骸里捞回一个新动作。"
    },
    "DAD-S-DOWNSTAIRS": {
      title: "爸爸在楼下",
      category: "game",
      cover: "assets/covers/dad-menu.png",
      demo: "https://dads-downstairs.app.workbuddy.host/",
      desc: "第一人称家庭恐怖 roguelike，全程 DV 录像机视角，低多边形风格。"
    },
    haitou: {
      title: "海投",
      category: "game",
      cover: "assets/covers/haitou-desktop.png",
      demo: "https://haitou.app.workbuddy.host/",
      desc: "关于找工作的单文件增量放置游戏，唯一动作是投简历，投得越多世界越冷漠。"
    },
    "Game-Proposal": {
      title: "《初言》策划案",
      category: "game",
      cover: "assets/covers/proposal-preview.png",
      demo: "",
      desc: "游戏策划案：用收集来的字说话、施法、解谜的治愈系奇幻冒险。"
    }
  },

  skills: ["Python", "JavaScript", "HTML / CSS", "Godot", "AI 工具链", "产品原型"],

  /* 内置快照：接口被限流或断网时用它兜底，保证页面永远有内容。
     数据抓取时间：2026-10-25 */
  snapshot: [
    {
      name: "Game-Proposal",
      full_name: "baiqiee/Game-Proposal",
      description: null,
      language: null,
      html_url: "https://github.com/baiqiee/Game-Proposal",
      homepage: null,
      has_pages: false,
      fork: false,
      archived: false,
      topics: [],
      stargazers_count: 0,
      updated_at: "2026-10-15T22:15:40Z"
    },
    {
      name: "DAD-S-DOWNSTAIRS",
      full_name: "baiqiee/DAD-S-DOWNSTAIRS",
      description: null,
      language: "JavaScript",
      html_url: "https://github.com/baiqiee/DAD-S-DOWNSTAIRS",
      homepage: null,
      has_pages: false,
      fork: false,
      archived: false,
      topics: [],
      stargazers_count: 0,
      updated_at: "2026-10-15T21:47:07Z"
    },
    {
      name: "haitou",
      full_name: "baiqiee/haitou",
      description: null,
      language: "HTML",
      html_url: "https://github.com/baiqiee/haitou",
      homepage: null,
      has_pages: false,
      fork: false,
      archived: false,
      topics: [],
      stargazers_count: 0,
      updated_at: "2026-10-15T19:23:58Z"
    },
    {
      name: "GameDemo-01",
      full_name: "baiqiee/GameDemo-01",
      description: null,
      language: "GDScript",
      html_url: "https://github.com/baiqiee/GameDemo-01",
      homepage: null,
      has_pages: false,
      fork: false,
      archived: false,
      topics: [],
      stargazers_count: 0,
      updated_at: "2026-10-15T18:26:23Z"
    },
    {
      name: "slimpal",
      full_name: "baiqiee/slimpal",
      description: "This is a lightweight virtual companion weight-loss app I developed with AI.",
      language: "JavaScript",
      html_url: "https://github.com/baiqiee/slimpal",
      homepage: null,
      has_pages: false,
      fork: false,
      archived: false,
      topics: [],
      stargazers_count: 0,
      updated_at: "2026-10-14T11:10:46Z"
    }
  ]
};
