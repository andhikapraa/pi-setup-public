---
name: prototype
description: "Build a disposable, shareable prototype that answers one unresolved logic, state-model, interaction, or UI design question. Use when inspection and prose cannot settle how something should behave or look. For UI questions, combine impeccable (when installed) with html-communication."
---

# Prototype

A prototype is throwaway evidence for one decision. It makes a tradeoff concrete; it does not choose for the user and it does not become production code by accident.

## Choose one branch

- **Logic or state:** Is this state machine, business rule, ordering, or interaction model right?
- **UI:** What should this page, component, workflow, or state look and feel like?

If the request clearly selects a branch, state that assumption. Ask one `ask_question` only when the branch changes what the user will evaluate. In non-interactive mode, ask in plain text and wait for the answer.

## Shared constraints

- Answer exactly one named question. Split unrelated questions into separate prototypes.
- Use synthetic data and public-safe terminology. Never publish secrets, customer data, proprietary source, private URLs, internal hostnames, credentials, or access-controlled assets.
- Keep prototype files outside the product repository by default. Do not add a production route, component, dependency, schema, migration, or test.
- If an in-repository runtime probe is explicitly requested, mark it `PROTOTYPE`, keep it disposable, and do not commit it unless separately authorized.
- Avoid persistence, architecture layers, error frameworks, test suites, and abstractions beyond what makes the question answerable.
- Surface relevant state and transitions so the user can see why an outcome occurred.
- Do not call a prototype complete until the user has a chance to react or the remaining decision is explicitly recorded.

## Logic or state prototype

Read `../html-communication/SKILL.md` before creating the artifact. Create one self-contained HTML file at a stable Postplan artifact path. The artifact must include:

- the exact question and assumptions;
- controls that drive meaningful transitions;
- complete relevant state after every action;
- guided scenarios for the happy path, awkward boundary case, and illegal action where relevant;
- an inline transition or decision flowchart when transitions materially affect the choice;
- a script-free fallback table describing scenarios and expected transitions;
- explicit observations, unresolved tradeoffs, and the decision the user must make.

Keep the logic separable from the page shell. Prefer a pure reducer, explicit state machine, or small pure functions. The page may call the logic; the logic must not depend on the DOM or button handlers. Use domain language rather than implementation labels. The artifact must remain useful without JavaScript. Do not reimplement the full application.

## UI prototype

When the `impeccable` skill is installed (the `frontend` ext), read it from its Pi skill catalog location first; it owns design direction, actual variants, relevant states, and local visual verification. Without it, own those yourself. After that work, read `../html-communication/SKILL.md` and hand off the completed comparison artifact without restyling it.

Prefer an existing route or page as the host. Use a new clearly marked prototype route only when there is no sensible host. Render normally three structurally different variants, switchable through a shareable `?variant=` parameter. Keep existing data fetching, authentication, and surrounding application context when using an existing route.

Each variant must differ in information architecture, interaction, or hierarchy, not only color or copy. Include any default, loading, empty, error, selected, disabled, or mobile state that changes the decision. State the tradeoff each variant tests without pretending all variants are recommended. Keep a clearly visible prototype switcher out of production builds.

Use `../browser-automation/SKILL.md` only when the owning UI workflow needs interactive browser verification. Do not claim visual verification from source inspection or from Postplan upload alone.

## Revision and handoff

Reuse the same stable artifact path while refining the same decision. Preserve previous and revised flowcharts together only when comparing the changed flow helps the decision.

After the user reacts:

1. record the selected direction, rejected tradeoffs, and remaining uncertainty;
2. when invoked from a Wayfinder decision, update its durable decision file and map pointer;
3. update a remote tracker only when explicitly authorized;
4. carry only the validated decision into `program` or normal planning;
5. rewrite the winning logic or UI into production properly; never promote prototype code wholesale.

## Completion

A prototype is complete when:

- one decision question is explicit;
- the artifact runs or is inspectable without project setup;
- relevant states and tradeoffs are visible;
- any required local visual verification is complete;
- the artifact passes `html-communication` validation and has a successful Postplan URL;
- no sensitive material was published;
- the user's decision or remaining question is recorded in the owning Wayfinder or project workflow.
