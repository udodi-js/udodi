---
title: Connect to Discord
description: Connect your Discord account to access Udodi's private sponsor support channel.
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
    <h1>Thanks for your support</h1>
    <p>
      Your sponsorship details have been submitted successfully. We appreciate your support of Udodi.
    </p>
    <div class="tip custom-block">
      <h2>Connect your Discord account</h2>
      <p>
        Connect the Discord account you want to use for sponsor access. Once authorized, 
        you'll receive access to the private sponsor channel.
      </p>
    </div>
    <div class="sponsor-discord-action">
      <a
        id="discord-connect-btn"
        class="discord-btn"
        href="#"
      >
<svg
    class="discord-icon"
    viewBox="0 0 24 24"
    width="20"
    height="20"
    aria-hidden="true"
>
    <path
        fill="currentColor"
        d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
    />
</svg>
        Connect Discord
      </a>
      <p class="hint">
        You will be redirected to Discord to authorize access. Only 
        the information needed to identify your account is requested.
      </p>
    </div>
  </div>
  <p class="copyright">
    © 2026 Udodi. All rights reserved.
  </p>

</div>

<script setup>
import { onMounted } from 'vue';

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  const submissionId = params.get('submission');
  const btn = document.getElementById('discord-connect-btn');

  if (!submissionId) {
    btn.classList.add('disabled');
    btn.removeAttribute('href');
    btn.setAttribute('aria-disabled', 'true');

    return;
  }

  btn.href = `https://udodi-sponsor-discord.udodi.workers.dev/oauth/start?submission=${encodeURIComponent(submissionId)}`;
})
</script>

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

.sponsor-discord-card h1 {
  text-align: center;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.3;
  margin: 0 0 2.5rem;
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
  text-align: left;
  font-size: 1rem;
  line-height: 1.7;
  color: var(--vp-c-text-2);
  margin: 0 0 1.1rem;
}

.sponsor-discord-card .custom-block {
  margin: 2.0rem 0;
  border-radius: 8px;
  padding: 0.9rem 1.1rem;
  border-left: 4px solid var(--vp-c-brand-1);
  background: color-mix(in srgb, var(--vp-c-brand-1) 8%, transparent);
}

.sponsor-discord-card .custom-block p {
  margin: 0;
  text-align: left;
  font-size: 0.95rem;
  color: var(--vp-c-text-2);
}

/* Action area */
.sponsor-discord-action {
  margin-top: 2rem;
  text-align: center;
}

.discord-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  min-width: 220px;
  height: 44px;
  padding: 0 1.5rem;
  border-radius: 8px;
  background-color: #5865F2;
  color: #fff !important;
  font-weight: 600;
  font-size: 0.95rem;
  text-decoration: none;
  transition: background-color 0.2s ease, opacity 0.2s ease;
  border: none;
  cursor: pointer;
  line-height: 1;
}

.discord-btn:hover {
  background-color: #4752C4;
  color: #fff !important;
}

.discord-btn.disabled,
.discord-btn[aria-disabled="true"] {
  background-color: #5865F2;
  opacity: 0.45;
  cursor: not-allowed;
}

.discord-icon {
  flex-shrink: 0;
}

.sponsor-discord-action .hint {
  margin-top: 1rem;
  text-align: center;
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
  line-height: 1.55;
}

/* Copyright — outside the card */
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