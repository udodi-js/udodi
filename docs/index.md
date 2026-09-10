---
layout: home
hero:
  text: Build reactive interfaces with less framework overhead.
  tagline: Udodi is a lightweight JavaScript UI framework engineered for a focused API and a dedicated virtual machine to execute declarative templates at peak performance.
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
				A small reactive core combined with the application primitives needed to
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
						<a href="/advanced/architecture">Architecture</a>
						<span>Explore how Udodi is structured internally.</span>
					</li>
					<li>
						<a href="/advanced/css-scoping">CSS Scoping</a>
						<span>Understand automatic component style scoping.</span>
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
				<a class="footer-sponsor" href="https://github.com/sponsors/udodi-js">
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
				<a href="/roadmap.html">Roadmap</a>
				<a href="/advanced/architecture">Architecture</a>
				<a href="/performance.html">Performance</a>
				<a href="https://github.com/sponsors/udodi-js">Sponsor</a>
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

let observer = null;
let resizeHandler = null;
let scrollHandler = null;

onMounted(async () => {
	await nextTick();

	const grid = document.querySelector('.capability-grid');
	const allDots = document.querySelectorAll('.carousel-dots .dot');

	if (!grid || allDots.length === 0) return;

	const isTablet = () => window.innerWidth > 640 && window.innerWidth <= 960;
	const isMobile = () => window.innerWidth <= 640;

	const setActiveDot = (index) => {
		allDots.forEach((d) => d.classList.remove('active'));

		if (isTablet()) {
			// Only 2 dots are visible
			const visibleDots = Array.from(allDots).filter(
				(dot) => window.getComputedStyle(dot).display !== 'none'
			);

			visibleDots[index]?.classList.add('active');

		} else if (isMobile()) {
			allDots[index]?.classList.add('active');
		}
	};

	// More reliable way to decide which "page" we are on
	const updateActiveFromScroll = () => {
		if (window.innerWidth > 960) return;

		const scrollLeft = grid.scrollLeft;
		const cardWidth = grid.children[0]?.offsetWidth || 1;
		const gap = 16; // same as your CSS gap

		if (isMobile()) {
			// 1 card per view
			const index = Math.round(scrollLeft / (cardWidth + gap));
			setActiveDot(Math.min(index, 2));

		} else if (isTablet()) {
			// 2 cards per view → 2 pages
			// page 0: cards 0+1
			// page 1: cards 1+2  (or cards 2 alone)
			const page = scrollLeft > cardWidth * 0.6 ? 1 : 0;
			setActiveDot(page);
		}
	}

	allDots.forEach((dot) => {
		dot.addEventListener('click', () => {
			const index = Number(dot.dataset.index);
			let targetIndex = index;

			if (isTablet()) {
				// On tablet, dot 0 → card 0, dot 1 → card 1 (or 2)
				targetIndex = index === 0 ? 0 : 1;
			}

			const card = grid.children[targetIndex];

			if (!card) return;

			const scrollLeft = card.offsetLeft - grid.offsetLeft;

			grid.scrollTo({
				left: scrollLeft,
				behavior: 'smooth'
			});
		});
	});

	scrollHandler = () => {
		// Use requestAnimationFrame for better performance
		requestAnimationFrame(updateActiveFromScroll);
	};

	grid.addEventListener('scroll', scrollHandler, { passive: true });

	let resizeTimeout;

	resizeHandler = () => {
		clearTimeout(resizeTimeout);

		resizeTimeout = setTimeout(() => {
			updateActiveFromScroll();
		}, 80);
	};

	window.addEventListener('resize', resizeHandler);

	// Initial run
	updateActiveFromScroll();
})

onUnmounted(() => {
	if (scrollHandler) {
		const grid = document.querySelector('.capability-grid');
		grid?.removeEventListener('scroll', scrollHandler);
	}

	if (resizeHandler) {
		window.removeEventListener('resize', resizeHandler);
	}
});
</script>
