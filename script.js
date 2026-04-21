/**
 * @file script.js
 * @description Core application logic for the Online Reservation System.
 *              Implements scroll animations, form validation, mock API integration,
 *              and dynamic toast notifications using vanilla ES6+ OOP architecture.
 * @author      Lead JavaScript Architect
 * @version     2.0.0
 */

'use strict';

/* ============================================================
 * UTILITY: DOM helpers
 * ============================================================ */

/**
 * Shorthand querySelector with optional context.
 * @param {string} selector
 * @param {Document|Element} [ctx=document]
 * @returns {Element|null}
 */
const $ = (selector, ctx = document) => ctx.querySelector(selector);

/**
 * Shorthand querySelectorAll returning a real Array.
 * @param {string} selector
 * @param {Document|Element} [ctx=document]
 * @returns {Element[]}
 */
const $$ = (selector, ctx = document) => [...ctx.querySelectorAll(selector)];


/* ============================================================
 * MODULE: Mock Backend API
 * ============================================================ */

/**
 * Simulates an async network call to a reservation backend.
 *
 * Design rationale:
 *   - Wraps `setTimeout` in a Promise so callers can use `await`.
 *   - Randomly rejects 20 % of the time to exercise error paths in the UI.
 *   - Returns a normalised response object on success, throws a typed Error on failure.
 *
 * @async
 * @param {Object} data - Validated reservation payload from the booking form.
 * @param {string} data.name
 * @param {string} data.email
 * @param {string} data.checkin
 * @param {string} data.checkout
 * @param {number} data.guests
 * @returns {Promise<{confirmationId: string, message: string}>}
 * @throws  {Error} Network or server-side error simulation.
 */
async function mockSubmitReservation(data) {
  const NETWORK_DELAY_MS = 2500;
  const SUCCESS_RATE     = 0.8;

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() < SUCCESS_RATE) {
        const confirmationId = `RES-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
        resolve({
          confirmationId,
          message: `Reservation confirmed! Your ID is ${confirmationId}.`,
        });
      } else {
        reject(new Error('The server could not process your request. Please try again.'));
      }
    }, NETWORK_DELAY_MS);
  });
}


/* ============================================================
 * CLASS: ReservationSystem
 * ============================================================ */

/**
 * @class ReservationSystem
 * @classdesc Encapsulates all UI behaviour for the Online Reservation System:
 *            - Scroll-driven animations via IntersectionObserver
 *            - Glassmorphism navbar effect on scroll
 *            - Real-time booking form validation
 *            - Async form submission with loading state management
 *            - Toast notification lifecycle management
 *
 * Instantiation pattern:
 *   Call `ReservationSystem.init()` once the DOM is ready.
 *   The static factory method guards against double-initialisation and
 *   returns the singleton instance for optional external access.
 */
class ReservationSystem {

  /** @type {ReservationSystem|null} Singleton instance reference. */
  static #instance = null;

  constructor() {
    // ── DOM references ──────────────────────────────────────────
    this._nav        = $('nav') ?? $('header');
    this._form       = $('[data-action="submit-reservation"]');
    this._submitBtn  = this._form ? $('[type="submit"]', this._form) : null;
    this._overlay    = null;   // Created lazily on first submit

    // ── IntersectionObserver instances ──────────────────────────
    this._cardObserver    = null;
    this._benefitObserver = null;

    // ── Toast queue tracking ─────────────────────────────────────
    this._toastStack = [];
  }

  /* ----------------------------------------------------------
   * Static factory / entry-point
   * ---------------------------------------------------------- */

  /**
   * Creates (or returns) the singleton ReservationSystem and wires all
   * event listeners + observers in the correct order.
   *
   * @static
   * @returns {ReservationSystem}
   */
  static init() {
    if (ReservationSystem.#instance) return ReservationSystem.#instance;
    const system = new ReservationSystem();
    system._bootstrap();
    ReservationSystem.#instance = system;
    return system;
  }

  /* ----------------------------------------------------------
   * Bootstrap
   * ---------------------------------------------------------- */

  /**
   * Orchestrates all initialisation steps.
   * Kept separate from the constructor so async concerns can be layered later.
   * @private
   */
  _bootstrap() {
    this._initNavScroll();
    this._initIntersectionObservers();
    this._initFormValidation();
    this._initFormSubmit();
  }

  /* ----------------------------------------------------------
   * 1. Navbar scroll effect
   * ---------------------------------------------------------- */

  /**
   * Attaches a passive scroll listener.
   * Adds/removes the `.scrolled` class on the <nav> element when the
   * viewport has scrolled more than 50 px — this triggers the
   * glassmorphism / shrink transition defined in CSS.
   *
   * Using `{ passive: true }` avoids janky composited-layer promotion
   * and signals to the browser that we will NOT call preventDefault().
   * @private
   */
  _initNavScroll() {
    if (!this._nav) return;

    const SCROLL_THRESHOLD = 50;

    const onScroll = () => {
      this._nav.classList.toggle('scrolled', window.scrollY > SCROLL_THRESHOLD);
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    // Run once on init in case page is loaded mid-scroll (e.g. back-navigation).
    onScroll();
  }

  /* ----------------------------------------------------------
   * 2. Intersection Observer — scroll reveal animations
   * ---------------------------------------------------------- */

  /**
   * Creates and attaches IntersectionObservers for animated elements.
   *
   * Two separate observers are used (rather than one) so that threshold
   * and rootMargin values can be independently tuned per element class.
   *
   * Pattern: once an element becomes visible we add `.is-visible` and
   * immediately `unobserve` it — the animation runs once, saving CPU
   * during subsequent scrolls.
   * @private
   */
  _initIntersectionObservers() {
    /**
     * Factory that returns a configured IntersectionObserver.
     * @param {IntersectionObserverInit} options
     * @returns {IntersectionObserver}
     */
    const makeObserver = (options) =>
      new IntersectionObserver((entries, observer) => {
        entries.forEach(({ isIntersecting, target }) => {
          if (!isIntersecting) return;
          target.classList.add('is-visible');
          observer.unobserve(target); // Fire-once → prevent repeat triggers
        });
      }, options);

    // Featured cards: trigger when 15 % of the element is in view.
    this._cardObserver = makeObserver({ threshold: 0.15 });
    $$('.featured-card, [data-animate="card"]').forEach(el => this._cardObserver.observe(el));

    // Benefit / feature items: slightly later trigger for a staged feel.
    this._benefitObserver = makeObserver({ threshold: 0.2, rootMargin: '0px 0px -40px 0px' });
    $$('.benefit-item, [data-animate="benefit"]').forEach(el => this._benefitObserver.observe(el));
  }

  /* ----------------------------------------------------------
   * 3. Form validation
   * ---------------------------------------------------------- */

  /**
   * Wires real-time validation listeners to the booking form.
   *
   * Validation rules:
   *   - Check-in  : must be today or a future date.
   *   - Check-out : must be strictly after Check-in.
   *   - Guests    : must be a positive integer (≥ 1).
   *
   * The submit button is enabled only when ALL fields pass.
   * Error states are applied via `.input--error` CSS class plus an
   * inline `data-error` attribute that a CSS `::after` pseudo-element
   * can surface as a tooltip.
   * @private
   */
  _initFormValidation() {
    if (!this._form) return;

    const checkinInput  = $('[name="checkin"],  #checkin',  this._form);
    const checkoutInput = $('[name="checkout"], #checkout', this._form);
    const guestsInput   = $('[name="guests"],   #guests',   this._form);

    if (!checkinInput || !checkoutInput) return;

    // ── Helpers ──────────────────────────────────────────────────

    /**
     * Returns a YYYY-MM-DD string for today (in local time, not UTC).
     * @returns {string}
     */
    const todayISO = () => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    /**
     * Applies or clears the error state on a given input.
     * @param {HTMLInputElement} el
     * @param {boolean}          isError
     * @param {string}           [message='']
     */
    const setError = (el, isError, message = '') => {
      el.classList.toggle('input--error', isError);
      if (isError) {
        el.setAttribute('data-error', message);
        el.setAttribute('aria-invalid', 'true');
      } else {
        el.removeAttribute('data-error');
        el.removeAttribute('aria-invalid');
      }
    };

    /**
     * Master validation function — runs on every change event.
     * Returns `true` if the entire form is valid.
     * @returns {boolean}
     */
    const validate = () => {
      const today    = todayISO();
      const checkin  = checkinInput.value;
      const checkout = checkoutInput.value;
      const guests   = parseInt(guestsInput?.value ?? '1', 10);

      let valid = true;

      // Check-in validation
      if (checkin && checkin < today) {
        setError(checkinInput, true, 'Check-in cannot be in the past.');
        valid = false;
      } else {
        setError(checkinInput, false);
      }

      // Check-out validation (only meaningful when check-in is also set)
      if (checkin && checkout && checkout <= checkin) {
        setError(checkoutInput, true, 'Check-out must be after Check-in.');
        valid = false;
      } else if (!checkout && checkin) {
        // Not yet filled — neutral, not an error
        setError(checkoutInput, false);
      } else {
        setError(checkoutInput, false);
      }

      // Enforce checkout minimum date dynamically
      if (checkin) checkoutInput.min = checkin;

      // Guests validation
      if (guestsInput) {
        const guestsInvalid = isNaN(guests) || guests < 1;
        setError(guestsInput, guestsInvalid, 'At least 1 guest is required.');
        if (guestsInvalid) valid = false;
      }

      // Disable submit until form is fully valid AND all required fields filled
      const allFilled = Boolean(checkin && checkout && (!guestsInput || guestsInput.value));
      if (this._submitBtn) this._submitBtn.disabled = !(valid && allFilled);

      return valid && allFilled;
    };

    // Enforce today as the earliest selectable check-in date.
    checkinInput.min = todayISO();

    // Attach listeners
    [checkinInput, checkoutInput, guestsInput].filter(Boolean).forEach(el => {
      el.addEventListener('change', validate);
      el.addEventListener('input',  validate);
    });
  }

  /* ----------------------------------------------------------
   * 4. Form submission — async with loading state
   * ---------------------------------------------------------- */

  /**
   * Handles the booking form `submit` event end-to-end:
   *   1. Prevents default browser navigation.
   *   2. Serialises form data.
   *   3. Activates the loading / disabled state.
   *   4. Calls `mockSubmitReservation`.
   *   5. Shows success or error toast.
   *   6. Restores the form to its interactive state.
   * @private
   */
  _initFormSubmit() {
    if (!this._form) return;

    this._form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Collect payload from named inputs
      const formData = new FormData(this._form);
      const payload  = Object.fromEntries(formData.entries());
      payload.guests = Number(payload.guests);

      this._setLoadingState(true);

      try {
        const { message } = await mockSubmitReservation(payload);
        this.showToast(message, 'success');
        this._form.reset();
        // Re-disable submit after reset (no valid dates selected)
        if (this._submitBtn) this._submitBtn.disabled = true;
      } catch (err) {
        this.showToast(err.message, 'error');
      } finally {
        this._setLoadingState(false);
      }
    });
  }

  /* ----------------------------------------------------------
   * 4a. Loading state management
   * ---------------------------------------------------------- */

  /**
   * Activates or deactivates the form's loading / disabled state.
   *
   * Loading state changes:
   *   - Submit button: disabled + text replaced with spinner markup.
   *   - A semi-transparent overlay `<div>` is injected over the form
   *     to block accidental double-submission via mouse/touch.
   *
   * @private
   * @param {boolean} isLoading
   */
  _setLoadingState(isLoading) {
    if (!this._submitBtn) return;

    if (isLoading) {
      // Persist original label for restoration
      this._submitBtn.dataset.originalText = this._submitBtn.textContent;
      this._submitBtn.disabled = true;
      this._submitBtn.innerHTML = `
        <span class="btn-spinner" aria-hidden="true"></span>
        <span>Processing…</span>
      `;
      this._submitBtn.classList.add('is-loading');

      // Inject overlay
      this._overlay = document.createElement('div');
      this._overlay.className = 'form-overlay';
      this._overlay.setAttribute('aria-hidden', 'true');
      this._form.style.position = 'relative';
      this._form.appendChild(this._overlay);

    } else {
      this._submitBtn.disabled = false;
      this._submitBtn.textContent = this._submitBtn.dataset.originalText ?? 'Check Availability';
      this._submitBtn.classList.remove('is-loading');
      delete this._submitBtn.dataset.originalText;

      // Remove overlay
      this._overlay?.remove();
      this._overlay = null;
    }
  }

  /* ----------------------------------------------------------
   * 5. Toast notification system
   * ---------------------------------------------------------- */

  /**
   * Dynamically creates, animates, and self-destructs a toast notification.
   *
   * Architecture notes:
   *   - Toasts are appended directly to `<body>` so z-index stacking is
   *     trivial and they are never clipped by overflow:hidden ancestors.
   *   - Entry animation is CSS-class-based (`toast--visible`) triggered
   *     via a 16 ms rAF delay (one frame) so the browser registers the
   *     initial off-screen transform before transitioning.
   *   - Removal is two-phase: first remove `.toast--visible` (slide-out),
   *     then after the CSS transition duration, remove the DOM node.
   *     This prevents the "element removed mid-animation" visual glitch.
   *   - All timeouts are stored and cleared in `_toastStack` to prevent
   *     memory leaks if the page unmounts (e.g. SPA navigation).
   *
   * @public
   * @param {string} message - Human-readable notification copy.
   * @param {'success'|'error'|'info'|'warning'} [type='info'] - Visual variant.
   */
  showToast(message, type = 'info') {
    const DISPLAY_DURATION_MS    = 4000;
    const EXIT_TRANSITION_MS     = 400;

    const ICON_MAP = {
      success : '✓',
      error   : '✕',
      info    : 'ℹ',
      warning : '⚠',
    };

    // Build element
    const toast = document.createElement('div');
    toast.className   = `toast toast--${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = `
      <span class="toast__icon" aria-hidden="true">${ICON_MAP[type] ?? ICON_MAP.info}</span>
      <span class="toast__message">${message}</span>
      <button class="toast__close" aria-label="Dismiss notification">×</button>
    `;

    // Manual dismiss
    $('.toast__close', toast).addEventListener('click', () => this._dismissToast(toast));

    document.body.appendChild(toast);

    // Trigger entry animation on next paint
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('toast--visible'));
    });

    // Auto-dismiss
    const autoId  = setTimeout(() => this._dismissToast(toast), DISPLAY_DURATION_MS);
    this._toastStack.push({ el: toast, timerId: autoId });
  }

  /**
   * Slides out and removes a toast element from the DOM.
   * Clears associated timeout to prevent stale callbacks.
   *
   * @private
   * @param {HTMLElement} toast - The toast element to dismiss.
   */
  _dismissToast(toast) {
    // Remove entry from tracking stack and clear its auto-dismiss timer
    const idx = this._toastStack.findIndex(t => t.el === toast);
    if (idx !== -1) {
      clearTimeout(this._toastStack[idx].timerId);
      this._toastStack.splice(idx, 1);
    }

    toast.classList.remove('toast--visible');

    // Remove from DOM after the CSS exit transition completes
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }

  /* ----------------------------------------------------------
   * Public API surface (optional external hooks)
   * ---------------------------------------------------------- */

  /**
   * Programmatically tears down all observers and listeners.
   * Useful in SPA contexts where the component is unmounted.
   * @public
   */
  destroy() {
    this._cardObserver?.disconnect();
    this._benefitObserver?.disconnect();
    // Flush any in-flight toasts
    this._toastStack.forEach(({ el, timerId }) => {
      clearTimeout(timerId);
      el.remove();
    });
    this._toastStack = [];
    ReservationSystem.#instance = null;
  }
}


/* ============================================================
 * BOOT — DOMContentLoaded guard
 * ============================================================ */

/**
 * Entry point.
 * Defers initialisation until the HTML is fully parsed so that
 * querySelector calls inside the class constructors find their targets.
 * `window.reservationSystem` is exposed for DevTools debugging only —
 * it is NOT part of the public API contract.
 */
document.addEventListener('DOMContentLoaded', () => {
  window.reservationSystem = ReservationSystem.init();
});
