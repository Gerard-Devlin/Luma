# Luma

<div align="center">
  <img src="public/logo.png" alt="Luma Logo" width="120">
</div>

<p align="center">
  <a href="README.md">English</a> · 中文
</p>

> **Luma** 是一款使用 **Next.js 14**、**Tailwind CSS** 和 **TypeScript** 构建的跨平台流媒体聚合应用。

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-14-000?style=for-the-badge&logo=nextdotjs)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3-38bdf8?style=for-the-badge&logo=tailwindcss)
![TypeScript](https://img.shields.io/badge/TypeScript-4.x-3178c6?style=for-the-badge&logo=typescript)
![License](https://img.shields.io/github/license/Gerard-Devlin/Luma?style=for-the-badge)
![Docker Ready](https://img.shields.io/badge/Docker-ready-blue?style=for-the-badge&logo=docker)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Worker-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-Powered-dc382d?style=for-the-badge&logo=redis&logoColor=white)
![TMDB](https://img.shields.io/badge/TMDB-Enhanced-01b4e4?style=for-the-badge)
![Stars](https://img.shields.io/github/stars/Gerard-Devlin/Luma?style=for-the-badge&logo=github&logoColor=white&color=7c3aed)

</div>

---

## 功能特性

- 🔎 **多源搜索**：跨已配置的内容源搜索，并在一个地方汇总结果。
- 🎬 **TMDB 元数据增强**：支持海报、背景图、评分、演员、合集和推荐内容。
- 🌐 **多语言界面**：支持英文和中文切换，TMDB 请求会跟随当前语言。
- 🧠 **个性化推荐引擎**：基于观看历史生成发现栏目，结合 TMDB 推荐、相似标题、关键词、演职员和排序信号。
- 🍿 **电影和剧集发现**：浏览电影、剧集、精选分类、年份、评分和片长筛选。
- ⭐ **收藏和继续观看**：保存收藏、观看历史、播放进度和续看位置。
- 🗄️ **多种存储后端**：支持 localStorage、Redis、Cloudflare D1 和 Upstash Redis。
- 👤 **用户管理和验证注册**：可在 `/admin` 管理用户，将账户存储到 D1 或 Redis，并要求新账户完成邮箱确认后再启用。
- ✉️ **精致的事务邮件**：使用 Resend 和 React Email 模板发送品牌化验证邮件，包含站点 Logo、确认按钮、备用链接和 GitHub 链接。
- 🛠️ **运行时管理后台**：可在 `/admin` 管理站点设置、用户、内容源、分类和系统选项。
- 📱 **PWA 就绪**：支持离线缓存、添加到主屏幕和移动端友好的体验。
- 🖥️ **响应式布局**：桌面侧边栏、移动端底部导航和大屏内容栏。

## 截图

<p align="center">
  <img src="public/readme-login.png" alt="Luma 登录界面" width="820">
</p>
<p align="center">
  <img src="public/screenshot1.png" alt="Luma 首页推荐" width="820">
</p>
<p align="center">
  <img src="public/screenshot2.png" alt="Luma 内容栏" width="820">
</p>
<p align="center">
  <img src="public/screenshot3.png" alt="Luma 首页轮播" width="820">
</p>

## 快速开始

```bash
pnpm install
pnpm dev
```

开发服务器默认运行在 `http://localhost:3000`。

## 部署

Docker、Vercel、Cloudflare Workers、存储后端和环境变量相关说明请查看 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 技术栈

| 领域             | 主要依赖                                                                  |
| ---------------- | ------------------------------------------------------------------------- |
| 框架             | [Next.js 14](https://nextjs.org/) App Router                              |
| UI 和样式        | [Tailwind CSS 3](https://tailwindcss.com/)、next-themes、Framer Motion    |
| 语言             | TypeScript 4                                                              |
| 数据和存储       | localStorage、Redis、Cloudflare D1、Upstash Redis                         |
| 认证和邮件       | 用户名/密码登录、邮箱验证注册、Resend、React Email                        |
| 内容增强         | TMDB API、分类内容源、图片代理                                            |
| 代码质量         | ESLint、Prettier、Jest                                                    |
| 部署             | Docker、Vercel、Cloudflare Workers、OpenNext                              |

## 许可证

[Apache-2.0](LICENSE) (c) 2026 Luma Contributors

## 致谢

<img src="public/TMDB_Green.svg" alt="TMDB Logo" width="120">

- [Next.js](https://nextjs.org/) 和 [Tailwind CSS](https://tailwindcss.com/)：应用框架和样式基础。
- 感谢开源项目、元数据服务和内容源 API 的维护者，是它们让这个项目成为可能。
