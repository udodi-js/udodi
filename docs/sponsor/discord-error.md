---
title: Discord Connection
description: There was a problem connecting your Discord account to your Udodi sponsorship.
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
    <div class="error-icon" aria-hidden="true">
<svg viewBox="0 0 24 24" width="24" height="24">
    <path
      fill="currentColor"
      d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2zm3.707 14.293a1 1 0 0 1-1.414 0L12 13.414l-2.293 2.293a1 1 0 0 1-1.414-1.414L10.586 12 8.293 9.707a1 1 0 0 1 1.414-1.414L12 10.586l2.293-2.293a1 1 0 0 1 1.414 1.414L13.414 12l2.293 2.293a1 1 0 0 1 0 1.414z"
    />
</svg>
    </div>
    <h1 id="error-title">We could not connect your Discord account</h1>
    <p id="error-message">
      We could not complete the Discord connection. Please return to the sponsor
      setup page and try again.
    </p>
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

<script setup>
import { onMounted } from 'vue';

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  const reason = params.get('reason');

  const title = document.getElementById('error-title');
  const message = document.getElementById('error-message');

  const messages = {
    cancelled: {
      title: "Discord connection cancelled",
      message: "You chose not to authorize Discord. Your account was not connected. If you change your mind, you can try again."
    },
    expired: {
      title: "Connection expired",
      message: "This Discord connection request has expired. Please return to the sponsor setup page and start the connection again."
    },
    failed: {
      title: "We could not connect your Discord account",
      message: "We could not complete the Discord connection. Please return to the sponsor setup page and try again."
    }
  };

  const content = messages[reason] || messages.failed;

  title.textContent = content.title;
  message.textContent = content.message;
});
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
  padding: 3rem 1.25rem 4rem;
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

.error-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 1.25rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #dc2626;
  background: rgb(220 38 38 / 0.1);
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

.sponsor-discord-card p {
  font-size: 1rem;
  line-height: 1.7;
  color: var(--vp-c-text-2);
  margin: 0;
  text-align: center;
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