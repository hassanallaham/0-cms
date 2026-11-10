/**
 * Progressive enhancement for the dashboard.
 *
 * Every screen works with JavaScript switched off: forms post, links navigate,
 * and pickers are plain `<select>` elements. This file collapses the sidebar,
 * makes the long option lists searchable, and confirms destructive submits.
 * Nothing here is required to use the app.
 */

(() => {
	"use strict";

	/** How many suggestions to request per keystroke burst. */
	const SUGGESTION_LIMIT = 20;

	/** localStorage key holding the sidebar's collapsed state. */
	const SIDEBAR_KEY = "cms:sidebar";

	/**
	 * Fetch suggestions for one entity.
	 *
	 * @param {string} entity
	 * @param {string} term
	 * @param {number} [exclude] - Id to keep out of the list.
	 * @returns {Promise<Array<{ id: number, label: string, detail: string }>>}
	 */
	async function suggest(entity, term, exclude) {
		const params = new URLSearchParams({
			q: term,
			limit: String(SUGGESTION_LIMIT),
		});
		if (exclude) params.set("exclude", String(exclude));

		const response = await fetch(`/v1/json/lookup/${entity}?${params}`, {
			headers: { accept: "application/json" },
		});
		if (!response.ok) return [];

		const payload = await response.json();
		return payload && payload.success ? payload.data : [];
	}

	/**
	 * Append an `<option>` for one suggestion, preserving the placeholder.
	 *
	 * @param {HTMLSelectElement} select
	 * @param {{ label: string, detail?: string }} suggestion
	 */
	function addOption(select, suggestion) {
		const option = document.createElement("option");
		option.value = suggestion.label;
		option.textContent = suggestion.detail
			? `${suggestion.label} — ${suggestion.detail}`
			: suggestion.label;
		select.append(option);
	}

	/**
	 * Make a select searchable by swapping its options for live suggestions.
	 *
	 * The original options are kept and restored on blur, so a user who ignores the
	 * text box still gets the full list.
	 *
	 * @param {HTMLSelectElement} select
	 */
	function enhanceSelect(select) {
		if (select.dataset.enhanced === "true") return;
		select.dataset.enhanced = "true";

		const entity = select.dataset.picker;
		const exclude = Number(select.dataset.exclude) || 0;

		const search = document.createElement("input");
		search.type = "search";
		search.className = "input";
		search.placeholder = "Type to search…";
		search.setAttribute("aria-label", `Search ${entity}`);
		select.parentNode?.insertBefore(search, select);

		const original = [...select.options].map((option) => ({
			value: option.value,
			text: option.textContent ?? "",
		}));

		let timer = 0;

		search.addEventListener("input", () => {
			window.clearTimeout(timer);
			const term = search.value.trim();

			// Debounced so a fast typist issues one request, not one per key.
			timer = window.setTimeout(async () => {
				if (term.length === 0) {
					for (const option of [...select.options]) {
						if (option.value !== "") option.remove();
					}
					for (const option of original) {
						if (option.value === "") continue;
						const created = document.createElement("option");
						created.value = option.value;
						created.textContent = option.text;
						select.append(created);
					}
					return;
				}

				const matches = await suggest(entity, term, exclude);
				for (const option of [...select.options]) {
					if (option.value !== "") option.remove();
				}
				for (const match of matches) {
					if (String(match.id) === String(exclude)) continue;
					addOption(select, match);
				}
				if (matches.length === 0) {
					const placeholder = document.createElement("option");
					placeholder.value = "";
					placeholder.textContent = "No matches";
					placeholder.disabled = true;
					select.append(placeholder);
				}
			}, 180);
		});

		search.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				select.focus();
			}
		});
	}

	/**
	 * Ask before submitting anything marked `data-confirm`.
	 *
	 * @param {SubmitEvent} event
	 */
	function confirmDestructive(event) {
		const message = event.submitter?.dataset.confirm;
		if (!message) return;
		if (!window.confirm(message)) event.preventDefault();
	}

	document.addEventListener(
		"submit",
		(event) => {
			const message = event.submitter?.dataset.confirm;
			if (!message) return;
			if (!window.confirm(message)) event.preventDefault();
		},
		true,
	);

	/**
	 * Collapse or expand the left sidebar, remembering the choice.
	 *
	 * The button is hidden by CSS when JavaScript is off, so there is never a
	 * control on screen that does nothing.
	 */
	function setupSidebar() {
		const toggle = document.querySelector("[data-sidebar-toggle]");
		const shell = document.querySelector(".shell");
		if (!toggle || !shell) return;

		const read = () => {
			try {
				return window.localStorage.getItem(SIDEBAR_KEY);
			} catch {
				return null;
			}
		};

		const write = (value) => {
			try {
				window.localStorage.setItem(SIDEBAR_KEY, value);
			} catch {
				// Private mode or a full quota — the toggle still works for this page.
			}
		};

		const apply = (collapsed) => {
			shell.dataset.sidebar = collapsed ? "collapsed" : "expanded";
			toggle.setAttribute("aria-expanded", String(!collapsed));
			toggle.setAttribute(
				"aria-label",
				collapsed ? "Expand sidebar" : "Collapse sidebar",
			);
		};

		apply(read() === "collapsed");

		toggle.addEventListener("click", () => {
			const collapsed = shell.dataset.sidebar !== "collapsed";
			apply(collapsed);
			write(collapsed ? "collapsed" : "expanded");
		});
	}

	setupSidebar();

	for (const select of document.querySelectorAll("select[data-picker]")) {
		enhanceSelect(select);
	}

	// Autosize the code textarea so the editor is not a tiny window in a tall card.
	for (const area of document.querySelectorAll("textarea.input--code")) {
		const resize = () => {
			area.style.height = "auto";
			area.style.height = `${Math.min(area.scrollHeight + 2, 60 * 16)}px`;
		};
		area.addEventListener("input", resize);
		resize();
	}
})();
