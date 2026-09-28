---
layout: home
hero:
  text: Build reactive interfaces without the framework weight.
  tagline: Udodi is a lightweight, zero-dependency JavaScript UI framework with a focused API and built-in application primitives.
  image:
    src: /udodi-hero.png
    alt: Udodi reactive interface architecture
  actions:
    - theme: brand
      text: Get Started
      link: /quick-start
    - theme: alt
      text: View on GitHub
      link: https://github.com/udodi-js/udodi
---

<div class="home-page">
	<section class="home-intro">
		<h2>
			<span class="brand-name">Udodi</span> is designed around a simple idea:
			application code should describe <strong>state</strong>,
			<strong>behavior</strong>, and <strong>interfaces</strong> without forcing
			developers to manage unnecessary framework machinery.
		</h2>
	</section>
	<section class="feature-tabs">
		<!-- CSS-only tabs: radios must come before labels and panels -->
		<input type="radio" name="feature-tab" id="tab-radio-fast" checked />
		<input type="radio" name="feature-tab" id="tab-radio-simple" />
		<input type="radio" name="feature-tab" id="tab-radio-powerful" />
		<div class="tab-nav" role="tablist" aria-label="Udodi strengths">
			<label for="tab-radio-fast">Fast</label>
			<label for="tab-radio-simple">Simple</label>
			<label for="tab-radio-powerful">Powerful</label>
		</div>
		<div class="tab-panels">
			<div class="tab-panel panel-fast" role="tabpanel">
<div class="tab-visual">

```js
import { effect, reactive } from "udodi";

const state = reactive(
  { count: 0 },
  {
    interceptors: {
	  // Keep count non-negative.
      count(value) {
        return Math.max(0, value);
      },
    },
  }
);

effect(() => {
  element.textContent = state.count;
});

// Fine-grained update
state.count++;
```

</div>
				<div class="tab-copy">
					<h3>Fine-grained updates that stay fast</h3>
					<p>
						Udodi tracks dependencies where reactive data is read, so changes update only
						the effects and interface parts that depend on that state, instead of broad
						component re-renders.
					</p>
					<p>
						Reactive state can also use interceptors to control or transform assignments
						before values are applied, keeping state rules close to the data itself.
						The result is a predictable reactive model with precise updates and minimal
						framework overhead.
					</p>
					<p><a class="learn-more" href="/reactivity/">Learn more →</a></p>
				</div>
			</div>
			<div class="tab-panel panel-simple" role="tabpanel">
<div class="tab-visual">

```js
import { createComponent, html } from "udodi";

export const Basic = createComponent({
  state() {
    return { count: 0 };
  },

  computed: {
    double(ctx) {
      return ctx.count * 2;
    },
  },

  methods: {
    increment() {
      this.count++;
    },
  },

  template: html`
    <button @on="click=increment">
      <span @text="double"></span>
    </button>
  `,
});
```

</div>
				<div class="tab-copy">
					<h3>A focused API you can hold in your head</h3>
					<p>
						Components keep state, behavior, and templates together, while a
						small directive set connects them to the DOM. You describe the
						interface; Udodi handles the reactive wiring without adding
						unnecessary machinery.
					</p>
					<p>
						The result is a component model that stays small enough to reason about 
						in full, yet complete enough to build real interfaces without reaching 
						for unnecessary extra libraries or hidden runtime layers.
					</p>
					<p><a class="learn-more" href="/fundamentals/components.html">Learn more →</a></p>
				</div>
			</div>
			<div class="tab-panel panel-powerful" role="tabpanel">
<div class="tab-visual">

```js
import { createQueryPool } from "udodi";

const pool = createQueryPool({
  worker: {
    enabled: true,
    computeWorkers: 2,
  },
});

pool.registerModule("processBuffer", {
  url: new URL("./workers/process-buffer.js", import.meta.url).href,
});

const processed = pool.query("processed", {
  module: "processBuffer",
});

await processed.fetch({
  input: arrayBuffer,
  transfer: true,
});

// Result is available reactively
// through processed.data
```

</div>
				<div class="tab-copy">
					<h3>Asynchronous data and worker execution without the bulk</h3>
					<p>
						Query Pool manages asynchronous queries, mutations, caching,
						invalidation, and request state while keeping server data isolated
						from your component and template model.
					</p>
					<p>
						For expensive work, queries can execute modules in Web Workers,
						keeping CPU-intensive tasks off the UI thread. Results return
						through reactive query state, and large payloads can be transferred
						without unnecessary copying.
					</p>
					<p><a class="learn-more" href="/query-pool/">Learn more →</a></p>
				</div>
			</div>
		</div>
	</section>
	<section class="capabilities">
		<div class="section-heading">
			<h2>Built for the parts that matter.</h2>
			<p>
				A small reactive core combined with the primitives needed to
				build real interfaces.
			</p>
		</div>
		<div class="capability-carousel">
			<div class="capability-grid">
				<div class="capability-card">
					<div class="feature-icon">
<svg viewBox="0 0 24 24" aria-hidden="true">
	<path d="M12 3v18M3 12h18M5.5 5.5l13 13M18.5 5.5l-13 13" />
</svg>
					</div>
					<h3>Fine-Grained Reactivity</h3>
					<p>
						Track dependencies where changes occur and update only the affected
						parts of the interface.
					</p>
					<a href="/reactivity/">Explore Reactivity →</a>
				</div>
				<div class="capability-card">
					<div class="feature-icon">
<svg viewBox="0 0 24 24" aria-hidden="true">
	<path d="M4 5h16M4 12h16M4 19h10" />
</svg>
					</div>
					<h3>Declarative Templates</h3>
					<p>
						Build interfaces with HTML and a small, predictable directive DSL.
					</p>
					<a href="/templates/">Explore Templates →</a>
				</div>
				<div class="capability-card">
					<div class="feature-icon">
<svg viewBox="0 0 24 24" aria-hidden="true">
	<rect x="4" y="4" width="6" height="6" rx="1" />
	<rect x="14" y="4" width="6" height="6" rx="1" />
	<rect x="9" y="14" width="6" height="6" rx="1" />
	<path d="M7 10v2h10v-2M12 12v2" />
</svg>
					</div>
					<h3>Component Architecture</h3>
					<p>
						Organize state, behavior, lifecycle, templates, and styles around
						reusable component boundaries.
					</p>
					<a href="/fundamentals/components.html">Explore Components →</a>
				</div>
			</div>
			<!-- Dots -->
			<div class="carousel-dots" aria-hidden="true">
				<button class="dot active" data-index="0"></button>
				<button class="dot" data-index="1"></button>
				<button class="dot" data-index="2"></button>
			</div>
		</div>
	</section>
	<section class="journey">
		<div class="section-heading">
			<h2>Start with the essentials.</h2>
			<p>
				Whether you are evaluating Udodi or building your first application,
				these guides provide the quickest path into the framework.
			</p>
		</div>
		<div class="journey-grid">
			<a class="journey-card" href="/installation.html">
				<span class="journey-number">01</span>
				<h3>Installation</h3>
				<p>Install Udodi and learn about the available distribution formats.</p>
			</a>
			<a class="journey-card" href="/quick-start.html">
				<span class="journey-number">02</span>
				<h3>Quick Start</h3>
				<p>
					Build a small reactive application and see the core workflow in
					practice.
				</p>
			</a>
			<a class="journey-card" href="/first-component.html">
				<span class="journey-number">03</span>
				<h3>Your First Component</h3>
				<p>
					Understand how state, behavior, templates, and styles work together.
				</p>
			</a>
			<a class="journey-card" href="/project-structure.html">
				<span class="journey-number">04</span>
				<h3>Project Structure</h3>
				<p>Learn how to organize an Udodi application as it grows.</p>
			</a>
		</div>
	</section>
	<section class="explore">
		<div class="section-heading">
			<h2>Explore the framework.</h2>
			<p>
				Move from the reactive core to application-level primitives and then
				into the runtime architecture.
			</p>
		</div>
		<div class="explore-grid">
			<div class="explore-column">
				<h3>Core</h3>
				<p class="column-description">
					The foundation of every Udodi application.
				</p>
				<ul>
					<li>
						<a href="/fundamentals/components.html">Fundamentals</a>
						<span>
							Components, state, methods, computed values, watchers, lifecycle,
							props, context, and styles.
						</span>
					</li>
					<li>
						<a href="/templates/">Templates and Directives</a>
						<span>Build reactive interfaces with Udodi's declarative template DSL.</span>
					</li>
					<li>
						<a href="/reactivity/">Reactivity</a>
						<span>
							Signals, effects, reactive state, collections, and touch function.
						</span>
					</li>
				</ul>
			</div>
			<div class="explore-column">
				<h3>Application</h3>
				<p class="column-description">
					Built-in primitives for common application concerns.
				</p>
				<ul>
					<li>
						<a href="/forms/">Forms and Validation</a>
						<span>Manage form state, fields, validation, and submission.</span>
					</li>
					<li>
						<a href="/store/">Udodi Store</a>
						<span>
							Manage shared reactive state and persistent application data.
						</span>
					</li>
					<li>
						<a href="/query-pool/">Query Pool</a>
						<span>
							Manage asynchronous data, mutations, caching, invalidation, and
							worker execution.
						</span>
					</li>
					<li>
						<a href="/overlay/">Overlay</a>
						<span>Build modals, dialogs, and layered interfaces.</span>
					</li>
				</ul>
			</div>
			<div class="explore-column">
				<h3>Advanced</h3>
				<p class="column-description">
					Understand the runtime beneath the API.
				</p>
				<ul>
					<li>
						<a href="/advanced/architecture.html">Architecture</a>
						<span>Explore how Udodi is structured internally.</span>
					</li>
					<li>
						<a href="/advanced/dom-rendering">DOM Rendering</a>
						<span>Learn how Udodi renders and updates interfaces.</span>
					</li>
					<li>
						<a href="/performance.html">Performance</a>
						<span>Explore reproducible benchmarks and published results.</span>
					</li>
				</ul>
				<div class="explore-api">
					<h4>API Reference</h4>
					<div class="api-links">
						<a href="/api/component">Component</a>
						<a href="/api/reactivity">Reactivity</a>
						<a href="/api/forms">Forms</a>
						<a href="/api/store">Store</a>
						<a href="/api/query-pool">Query Pool</a>
						<a href="/api/overlay">Overlay</a>
						<a href="/api/utilities">Utilities</a>
					</div>
				</div>
			</div>
		</div>
	</section>
	<section class="reference-section">
		<div class="reference-content">
			<h2>Guides for learning. Reference for precision.</h2>
			<p>
				Start with the guides when learning Udodi. Move to the API reference
				when you need exact details about a specific capability.
			</p>
			<div class="reference-actions">
				<a class="reference-primary" href="/api/">Browse API Reference</a>
				<a class="reference-secondary" href="/performance.html">View Performance</a>
			</div>
		</div>
	</section>
	<!-- Sponsors: injected from /sponsors.json. Empty tiers are omitted; section stays hidden if none. -->
	<section class="sponsors-section" data-sponsors-root hidden="hidden">
		<div class="section-heading sponsors-heading">
			<p class="eyebrow">Supported by the community</p>
			<h2>Built with the support of others.</h2>
			<p>Sponsors help keep Udodi independent and support continued work on its core, documentation, testing, performance, and developer experience.</p>
		</div>
		<div data-sponsors-mount></div>
		<div class="sponsors-cta">
			<p>Interested in supporting Udodi?</p>
			<a href="https://github.com/sponsors/udodi-js">Become a sponsor →</a>
		</div>
	</section>
</div>
<footer class="site-footer">
	<div class="site-footer-inner">
		<!-- CTA -->
		<div class="footer-cta">
			<div>
				<h2>Build with Udodi.</h2>
				<p>
					Explore the framework, inspect the source, and follow the
					documentation from your first component to application-level
					infrastructure.
				</p>
			</div>
			<div class="footer-actions">
				<a class="cta-primary" href="/quick-start.html">
					Get Started
				</a>
				<a
					class="cta-secondary"
					href="https://github.com/udodi-js/udodi"
				>
					View on GitHub
				</a>
				<a class="footer-sponsor" href="/sponsor.html">
  					<span class="sponsor-hearts" aria-hidden="true"></span>
<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
	<path d="M1.24264 8.24264L8 15L14.7574 8.24264C15.553 7.44699 16 6.36786 16 5.24264V5.05234C16 2.8143 14.1857 1 11.9477 1C10.7166 1 9.55233 1.55959 8.78331 2.52086L8 3.5L7.21669 2.52086C6.44767 1.55959 5.28338 1 4.05234 1C1.8143 1 0 2.8143 0 5.05234V5.24264C0 6.36786 0.44699 7.44699 1.24264 8.24264Z"/>
</svg>
  					<span>Sponsor</span>
				</a>
			</div>
		</div>
		<!-- Footer columns -->
		<div class="footer-columns">
			<div class="footer-brand">
				<a href="/" class="footer-logo">
					<img src="/udodi-logo.svg" alt="Udodi" width="28" height="28" />
					<span>Udodi</span>
				</a>
				<p>
					A lightweight, dependency-free JavaScript UI framework built
					around fine-grained reactivity.
				</p>
				<!-- Social links -->
	<nav class="footer-social" aria-label="Social links">
		<a
			href="https://github.com/udodi-js/udodi"
			target="_blank"
			rel="noopener noreferrer"
			aria-label="GitHub"
			title="GitHub"
		>
<svg viewBox="0 0 24 24" aria-hidden="true">
	<path
		fill="currentColor"
		d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z"
	/>
</svg>
		</a>
		<a
			href="https://x.com/udodi_js"
			target="_blank"
			rel="noopener noreferrer"
			aria-label="X"
			title="X"
		>
<svg viewBox="0 0 24 24" aria-hidden="true">
	<path
		fill="currentColor"
		d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
	/>
</svg>
		</a>
		<a
			href="https://discord.gg/YFqSHD75BN"
			target="_blank"
			rel="noopener noreferrer"
			aria-label="Discord"
			title="Discord"
		>
<svg viewBox="0 0 24 24" aria-hidden="true">
	<path
		fill="currentColor"
		d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
	/>
</svg>
		</a>
		<a
			href="https://www.linkedin.com/company/udodi"
			target="_blank"
			rel="noopener noreferrer"
			aria-label="LinkedIn"
			title="LinkedIn"
		>
<svg viewBox="0 0 24 24" aria-hidden="true">
	<path
		fill="currentColor"
		d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
	/>
</svg>
		</a>
	</nav>
			</div>
			<div class="footer-column">
				<h3>Learn</h3>
				<a href="/installation.html">Installation</a>
				<a href="/quick-start.html">Quick Start</a>
				<a href="/first-component.html">First Component</a>
				<a href="/project-structure.html">Project Structure</a>
			</div>
			<div class="footer-column">
				<h3>Application</h3>
				<a href="/forms/">Forms</a>
				<a href="/store/">Store</a>
				<a href="/query-pool/">Query Pool</a>
				<a href="/overlay/">Overlay</a>
			</div>
			<div class="footer-column">
				<h3>Project</h3>
				<a href="https://github.com/udodi-js/udodi">GitHub</a>
				<a href="/advanced/architecture.html">Architecture</a>
				<a href="/performance.html">Performance</a>
				<a href="/roadmap.html">Roadmap</a>
			</div>
		</div>
		<!-- Bottom -->
		<div class="footer-bottom">
			<span>
				© {{ new Date().getFullYear() }} Udodi.
				Released under the MIT License.
			</span>
		</div>
		<!-- Wordmark -->
		<div class="footer-wordmark" aria-hidden="true">
<svg
    viewBox="0 0 1600 520"
    preserveAspectRatio="xMidYMax meet"
    focusable="false"
  >
    <defs>
      <linearGradient id="udodi-footer-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#6ee7b7" />
        <stop offset="45%" stop-color="#10b981" />
        <stop offset="100%" stop-color="#047857" />
      </linearGradient>
    </defs>
    <text
      x="50%"
      y="88%"
      text-anchor="middle"
      fill="none"
      stroke="url(#udodi-footer-gradient)"
      stroke-width="2"
      vector-effect="non-scaling-stroke"
      font-family="Inter, ui-sans-serif, system-ui, sans-serif"
      font-size="550"
      font-weight="800"
      letter-spacing="-24"
    >Udodi</text>
</svg>
		</div>
	</div>
</footer>

<script setup>
import { onMounted, onUnmounted, nextTick } from 'vue';

let resizeHandler = null;
let scrollHandler = null;
let sponsorResizeHandler = null;

onMounted(async () => {
	await nextTick();

	// *********************** Capability carousel ***********************
	const grid = document.querySelector('.capability-grid');
	const allDots = document.querySelectorAll('.carousel-dots .dot');

	if (grid && allDots.length > 0) {
		const isTablet = () => window.innerWidth > 640 && window.innerWidth <= 960;
		const isMobile = () => window.innerWidth <= 640;

		const setActiveDot = (index) => {
			allDots.forEach((d) => d.classList.remove('active'));

			if (isTablet()) {
				const visibleDots = Array.from(allDots).filter(
					(dot) => window.getComputedStyle(dot).display !== 'none'
				);

				visibleDots[index]?.classList.add('active');
				
			} else if (isMobile()) {
				allDots[index]?.classList.add('active');
			}
		};

		const updateActiveFromScroll = () => {
			if (window.innerWidth > 960) return;

			const scrollLeft = grid.scrollLeft;
			const cardWidth = grid.children[0]?.offsetWidth || 1;
			const gap = 16;

			if (isMobile()) {
				const index = Math.round(scrollLeft / (cardWidth + gap));
				setActiveDot(Math.min(index, 2));

			} else if (isTablet()) {
				const page = scrollLeft > cardWidth * 0.6 ? 1 : 0;
				setActiveDot(page);
			}
		};

		allDots.forEach((dot) => {
			dot.addEventListener('click', () => {
				const index = Number(dot.dataset.index);
				let targetIndex = index;

				if (isTablet()) {
					targetIndex = index === 0 ? 0 : 1;
				}

				const card = grid.children[targetIndex];
				if (!card) return;

				const scrollLeft = card.offsetLeft - grid.offsetLeft;
				grid.scrollTo({ left: scrollLeft, behavior: 'smooth' });
			});
		});

		scrollHandler = () => {
			requestAnimationFrame(updateActiveFromScroll);
		};

		grid.addEventListener('scroll', scrollHandler, { passive: true });

		let resizeTimeout;

		resizeHandler = () => {
			clearTimeout(resizeTimeout);
			resizeTimeout = setTimeout(updateActiveFromScroll, 80);
		};

		window.addEventListener('resize', resizeHandler);

		updateActiveFromScroll();
	}

	// *************************** Sponsors (from R2 / CDN) ***************************
    const SPONSORS_URL = 'https://cdn.udodi.dev/sponsors/sponsors.json';

	const prefersReducedMotion = window.matchMedia(
		'(prefers-reduced-motion: reduce)'
	).matches;

	const escapeHtml = (str) =>
		String(str)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');

	const sponsorLink = (s) => {
		const name = escapeHtml(s.name || 'Sponsor');
		const url = escapeHtml(s.url || '#');
		const logo = escapeHtml(s.logo || '');

		return (
			'<a href="' + url + '" target="_blank" rel="noopener noreferrer">' +
			'<img src="' + logo + '" alt="' + name + ' sponsor" loading="lazy" />' +
			'</a>'
		);
	};

	const renderFeaturedTier = (tier, list) => {
		if (!list || list.length === 0) return '';

		const logos = list.map(sponsorLink).join('');
		const label = tier.charAt(0).toUpperCase() + tier.slice(1);

		return (
			'<div class="sponsor-tier sponsor-tier-' + tier + '">' +
			'<h3>' + label + '</h3>' +
			'<div class="sponsor-featured">' + logos + '</div>' +
			'</div>'
		);
	};

	const renderWall = (silver, bronze) => {
		const hasSilver = silver && silver.length > 0;
		const hasBronze = bronze && bronze.length > 0;

		if (!hasSilver && !hasBronze) return '';

		let html = '<div class="sponsor-wall">';

		if (hasSilver) {
			html +=
				'<div class="sponsor-row-container">' +
				'<div class="sponsor-row sponsor-row-silver">' +
				silver.map(sponsorLink).join('') +
				'</div></div>';
		}

		if (hasBronze) {
			html +=
				'<div class="sponsor-row-container">' +
				'<div class="sponsor-row sponsor-row-bronze">' +
				bronze.map(sponsorLink).join('') +
				'</div></div>';
		}

		html += '</div>';
		return html;
	};

	const waitForImages = (row) => {
		const images = Array.from(row.querySelectorAll('img'));
		if (images.length === 0) return Promise.resolve();

		return Promise.all(
			images.map((img) => {
				if (img.complete && img.naturalWidth > 0) return Promise.resolve();

				return new Promise((resolve) => {
					const done = () => {
						img.removeEventListener('load', done);
						img.removeEventListener('error', done);
						resolve();
					};

					img.addEventListener('load', done);
					img.addEventListener('error', done);
				});
			})
		);
	};

	const checkOverflow = (row) => {
		const container = row.parentElement;
		if (!container || !row) return;

		if (prefersReducedMotion) {
			row.classList.remove('is-overflowing');
			return;
		}

		row.classList.remove('is-overflowing');

		const clones = row.querySelectorAll('a[aria-hidden="true"]');
		clones.forEach((el) => {
			el.style.display = 'inline-flex';
		});

		row.style.width = 'max-content';
		row.style.maxWidth = 'none';
		row.style.minWidth = '0';
		row.style.justifyContent = 'flex-start';
		row.style.padding = '0';
		void row.offsetWidth;

		const contentWidth = row.scrollWidth / 2;
		const available = container.clientWidth;
		const needsScroll = contentWidth > available + 1;

		row.style.width = '';
		row.style.maxWidth = '';
		row.style.minWidth = '';
		row.style.justifyContent = '';
		row.style.padding = '';

		clones.forEach((el) => {
			el.style.display = '';
		});

		if (needsScroll) {
			row.classList.add('is-overflowing');
		}
	};

	const setupSponsorRow = async (row) => {
		if (!row || row.children.length === 0) return;

		if (row.dataset.duplicated !== 'true') {
			const originals = Array.from(row.children);

			originals.forEach((el) => {
				const clone = el.cloneNode(true);
				clone.setAttribute('aria-hidden', 'true');
				clone.tabIndex = -1;
				row.appendChild(clone);
			});

			row.dataset.duplicated = 'true';
		}

		await waitForImages(row);
		checkOverflow(row);
		requestAnimationFrame(() => checkOverflow(row));
	};

	const initSponsorMarquee = async () => {
		const silverRow = document.querySelector('.sponsor-row-silver');
		const bronzeRow = document.querySelector('.sponsor-row-bronze');

		await Promise.all([
			setupSponsorRow(silverRow),
			setupSponsorRow(bronzeRow),
		]);

		const recheck = () => {
			if (silverRow) checkOverflow(silverRow);
			if (bronzeRow) checkOverflow(bronzeRow);
		};

		setTimeout(recheck, 300);
		setTimeout(recheck, 1000);

		let sponsorResizeTimeout;

		sponsorResizeHandler = () => {
			clearTimeout(sponsorResizeTimeout);
			sponsorResizeTimeout = setTimeout(recheck, 80);
		};

		window.addEventListener('resize', sponsorResizeHandler);

		if (typeof ResizeObserver !== 'undefined') {
			const ro = new ResizeObserver(() => {
				clearTimeout(sponsorResizeTimeout);
				sponsorResizeTimeout = setTimeout(recheck, 80);
			});

			if (silverRow && silverRow.parentElement) ro.observe(silverRow.parentElement);
			if (bronzeRow && bronzeRow.parentElement) ro.observe(bronzeRow.parentElement);
			
			window.__sponsorRowRO = ro;
		}
	};

	const loadSponsors = async () => {
		const root = document.querySelector('[data-sponsors-root]');
		const mount = document.querySelector('[data-sponsors-mount]');

		if (!root || !mount) return;

		let data;

		try {
			const res = await fetch(SPONSORS_URL);
			if (!res.ok) throw new Error('HTTP ' + res.status);
			data = await res.json();

		} catch (err) {
			console.warn('[sponsors] failed to load', err);
			return;
		}

		const platinum = Array.isArray(data.platinum) ? data.platinum : [];
		const gold = Array.isArray(data.gold) ? data.gold : [];
		const silver = Array.isArray(data.silver) ? data.silver : [];
		const bronze = Array.isArray(data.bronze) ? data.bronze : [];

		const hasAny =
			platinum.length + gold.length + silver.length + bronze.length > 0;

		if (!hasAny) {
			root.hidden = true;
			return;
		}

		mount.innerHTML = [
			renderFeaturedTier('platinum', platinum),
			renderFeaturedTier('gold', gold),
			renderWall(silver, bronze),
		].filter(Boolean).join('');

		root.hidden = false;
		await nextTick();
		await initSponsorMarquee();
	};

	await loadSponsors();
});

onUnmounted(() => {
	if (scrollHandler) {
		const grid = document.querySelector('.capability-grid');
		grid?.removeEventListener('scroll', scrollHandler);
	}

	if (resizeHandler) {
		window.removeEventListener('resize', resizeHandler);
	}

	if (sponsorResizeHandler) {
		window.removeEventListener('resize', sponsorResizeHandler);
	}

	if (window.__sponsorRowRO) {
		window.__sponsorRowRO.disconnect();
		delete window.__sponsorRowRO;
	}
});
</script>
