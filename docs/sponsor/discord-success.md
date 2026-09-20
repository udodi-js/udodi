---
title: Discord Connected
description: Your Discord account has been connected to your Udodi sponsorship.
layout: false
navbar: false
sidebar: false
aside: false
editLink: false
lastUpdated: false
footer: false
pageClass: sponsor-discord-page
---

<div class="sponsor-discord-wrapper">

  <header class="sponsor-discord-header">
    <a href="/" class="logo-link">
      <img src="/favicon.svg" alt="Udodi" class="logo" width="36" height="36" />
      <span class="logo-text">Udodi</span>
    </a>
  </header>

  <div class="sponsor-discord-card">
    <div class="success-icon" aria-hidden="true">
<svg viewBox="0 0 24 24" width="24" height="24">
    <path
        fill="currentColor"
        d="M20.285 5.708a1 1 0 0 1 .007 1.414l-10.01 10.11a1 1 0 0 1-1.425.008l-5.15-5.01a1 1 0 1 1 1.394-1.436l4.44 4.31 9.302-9.39a1 1 0 0 1 1.442-.006z"
    />
</svg>
    </div>
    <h1>Connected successfully</h1>
    <p>
      Your Discord account has been successfully connected to your Udodi sponsorship.
    </p>
    <div class="tip custom-block">
      <h2>What's next?</h2>
      <p>
        Your sponsor access is now being set up. Once synchronization is
        complete, you'll have access to the private sponsor channel.
      </p>
    </div>
    <div class="sponsor-discord-action">
      <a href="/" class="back-btn">
        Return to Udodi
      </a>
    </div>
  </div>
  <p class="copyright">
    © 2026 Udodi. All rights reserved.
  </p>

</div>

<style>
.sponsor-discord-page {
  --vp-c-brand-1: #059669;
  --vp-c-brand-2: #047857;
  background: var(--vp-c-bg);
  min-height: 100vh;
}

.sponsor-discord-wrapper {
  max-width: 560px;
  margin: 0 auto;
  padding: 5rem 1.25rem 4rem;
}

/* Centered logo header */
.sponsor-discord-header {
  display: flex;
  justify-content: center;
  margin-bottom: 2.5rem;
}

.logo-link {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  text-decoration: none;
  color: var(--vp-c-text-1);
  font-weight: 600;
  font-size: 1.25rem;
  letter-spacing: -0.01em;
}

.logo-link:hover {
  color: var(--vp-c-brand-1);
}

.logo {
  width: 36px;
  height: 36px;
  display: block;
}

/* Elevated card */
.sponsor-discord-card {
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 2.25rem 2rem;
  box-shadow:
    0 4px 6px -1px rgb(0 0 0 / 0.06),
    0 10px 15px -3px rgb(0 0 0 / 0.08);
  text-align: left;
}

.success-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 1.25rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--vp-c-brand-1);
  background: color-mix(in srgb, var(--vp-c-brand-1) 10%, transparent);
}

.sponsor-discord-card h1 {
  text-align: center;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.3;
  margin: 0 0 1.5rem;
  color: var(--vp-c-text-1);
}

.sponsor-discord-card h2 {
  font-size: 1rem;
  font-weight: 650;
  letter-spacing: -0.01em;
  line-height: 1.4;
  margin: 0 0 0.75rem;
  color: var(--vp-c-text-1);
}

.sponsor-discord-card p {
  font-size: 1rem;
  line-height: 1.7;
  color: var(--vp-c-text-2);
  margin: 0 0 1.1rem;
}

.sponsor-discord-card > p {
  text-align: center;
}

.sponsor-discord-card .custom-block {
  margin: 2rem 0;
  border-radius: 8px;
  padding: 0.9rem 1.1rem;
  border-left: 4px solid var(--vp-c-brand-1);
  background: color-mix(in srgb, var(--vp-c-brand-1) 8%, transparent);
}

.sponsor-discord-card .custom-block p {
  margin: 0;
  font-size: 0.95rem;
  color: var(--vp-c-text-2);
}

/* Action area */
.sponsor-discord-action {
  margin-top: 2rem;
  text-align: center;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 180px;
  height: 44px;
  padding: 0 1.5rem;
  border-radius: 8px;
  background-color: var(--vp-c-brand-1);
  color: #fff !important;
  font-weight: 600;
  font-size: 0.95rem;
  text-decoration: none;
  transition: background-color 0.2s ease;
  line-height: 1;
}

.back-btn:hover {
  background-color: var(--vp-c-brand-2);
  color: #fff !important;
}

/* Copyright */
.copyright {
  margin-top: 1.5rem;
  text-align: center;
  font-size: 0.8rem;
  color: var(--vp-c-text-3, #98989f);
}

/* Dark mode support */
.dark .sponsor-discord-card {
  background: var(--vp-c-bg-soft);
  border-color: var(--vp-c-divider);
  box-shadow:
    0 4px 6px -1px rgb(0 0 0 / 0.25),
    0 10px 20px -3px rgb(0 0 0 / 0.3);
}
</style>