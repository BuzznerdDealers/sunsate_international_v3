// Form rendering. A form is defined once in `site/forms/<id>.json` and referenced
// by id from a page, so validation, consent and notification routing live in one
// place instead of being re-invented per page by whoever (or whatever) edits it.
//
// Submission is same-origin through the storefront prefix: the dealer's own
// domain proxies `/store/*` to the Remix app, which forwards to the Shop API.
// That keeps the visitor cookie first-party and means the published static site
// still needs no server runtime of its own.

import { attrs, esc, join, tagAttrs } from './html.mjs';

/** Field types the builder offers, grouped as the palette presents them. */
export const FIELD_TYPES = {
  basic: ['single_line', 'paragraph', 'email', 'phone', 'number', 'date', 'file'],
  choice: ['radio', 'checkboxes', 'dropdown'],
  identity: ['first_name', 'last_name', 'full_name'],
};

const INPUT_TYPE = {
  single_line: 'text',
  email: 'email',
  phone: 'tel',
  number: 'number',
  date: 'date',
  file: 'file',
  first_name: 'text',
  last_name: 'text',
  full_name: 'text',
};

const AUTOCOMPLETE = {
  email: 'email',
  phone: 'tel',
  first_name: 'given-name',
  last_name: 'family-name',
  full_name: 'name',
};

/** Operators each field type supports, mirrored by the dashboard's logic editor. */
export function operatorsForFieldType(type) {
  if (FIELD_TYPES.choice.includes(type)) return ['is', 'is_not'];
  if (type === 'number') return ['is', 'is_not', 'greater_than', 'less_than'];
  if (type === 'date') return ['is', 'is_not', 'before', 'after'];
  if (type === 'file') return ['is_empty', 'is_not_empty'];
  return ['is', 'is_not', 'contains', 'is_empty', 'is_not_empty'];
}

function fieldName(field) {
  return field.name || field.id;
}

/**
 * A form's or a field's analytics annotations, as they reach the browser.
 *
 * Namespaced by provider id — `{"shift-digital": {"formType": "Get a Quote"}}` —
 * because the values are each provider's own restricted vocabulary. Two
 * providers wanting a different form type for the same form is normal, and a
 * flat bag would have one of them silently overwrite the other.
 *
 * The renderer does not interpret any of it. It copies string leaves and drops
 * everything else: an object or an array would serialise into an event property
 * no provider can read, and shipping `[object Object]` as a form type is worse
 * than shipping nothing.
 */
function analyticsBag(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const out = {};
  let any = false;
  for (const [providerId, values] of Object.entries(source)) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) continue;
    const kept = {};
    let keptAny = false;
    for (const [key, value] of Object.entries(values)) {
      if (typeof value !== 'string' || value === '') continue;
      kept[key] = value;
      keptAny = true;
    }
    if (!keptAny) continue;
    out[providerId] = kept;
    any = true;
  }
  return any ? JSON.stringify(out) : null;
}

function renderChoices(field, name) {
  const options = field.options || [];
  if (field.type === 'dropdown') {
    return `<select class="bz-input" id="${esc(field.id)}" name="${esc(name)}"${attrs({
      required: !!field.required,
    })}>
  <option value="">${esc(field.placeholder || 'Choose…')}</option>
${join(
  options.map((o) => `  <option value="${esc(o.value ?? o.label)}">${esc(o.label)}</option>`),
  '\n',
)}
</select>`;
  }
  const type = field.type === 'checkboxes' ? 'checkbox' : 'radio';
  const inputName = type === 'checkbox' ? `${name}[]` : name;
  return `<div class="bz-choices" role="group" aria-labelledby="${esc(field.id)}-l">${join(
    options.map(
      (o, i) =>
        `<label class="bz-choice"><input type="${type}" name="${esc(inputName)}" value="${esc(
          o.value ?? o.label,
        )}"${attrs({
          required: !!field.required && type === 'radio' && i === 0,
        })} /><span>${esc(o.label)}</span></label>`,
    ),
    '',
  )}</div>`;
}

function renderField(field) {
  const name = fieldName(field);
  // What this field reports as, per provider. Absent when the dealer has not
  // mapped it, and the runtime then falls back to the input's own name rather
  // than guessing at a vocabulary it does not have.
  const analyticsName = analyticsBag(field.analytics);
  const label = `<label class="bz-label" id="${esc(field.id)}-l" for="${esc(field.id)}">${esc(
    field.label,
  )}${field.required ? ' <span class="bz-req" aria-hidden="true">*</span>' : ''}</label>`;

  let control;
  if (field.type === 'paragraph') {
    control = `<textarea class="bz-input" id="${esc(field.id)}" name="${esc(name)}" rows="4"${attrs({
      required: !!field.required,
      placeholder: field.placeholder || null,
    })}></textarea>`;
  } else if (FIELD_TYPES.choice.includes(field.type)) {
    control = renderChoices(field, name);
  } else {
    control = `<input class="bz-input" id="${esc(field.id)}" name="${esc(name)}"${attrs({
      type: INPUT_TYPE[field.type] || 'text',
      required: !!field.required,
      placeholder: field.placeholder || null,
      autocomplete: AUTOCOMPLETE[field.type] || null,
      accept: field.type === 'file' ? field.accept || null : null,
    })} />`;
  }

  // Conditional logic travels as data attributes rather than generated script, so
  // one platform-shipped client handles every dealer's forms and a logic change
  // is a JSON edit rather than a code change in a dealer repo.
  const logic = field.logic && field.logic.rules && field.logic.rules.length ? field.logic : null;

  return `<div class="bz-field"${attrs({
    'data-bz-field': field.id,
    'data-bz-field-analytics': analyticsName,
    'data-bz-logic': logic ? JSON.stringify(logic) : null,
    hidden: logic ? true : null,
  })}>${label}${control}${field.help ? `<p class="bz-help">${esc(field.help)}</p>` : ''}</div>`;
}

/**
 * Render a form definition. `ctx.storefrontPrefix` decides the action path; the
 * prefix is preserved, never stripped, because the rewrite on the dealer's
 * domain forwards the whole path to the Remix mount.
 */
export function renderForm(form, ctx) {
  if (!form || !form.id) return '';
  if (form.status && form.status !== 'live' && !(ctx && ctx.includeDraftForms)) {
    if (ctx && ctx.warn) ctx.warn(`Form "${form.id}" is a draft and was not rendered.`);
    return '';
  }
  const prefix = (ctx && ctx.storefrontPrefix) || 'store';
  const fields = join((form.fields || []).map(renderField), '\n');
  const consent =
    form.consent && form.consent.enabled
      ? `<div class="bz-field bz-field--consent"><label class="bz-choice"><input type="checkbox" name="consent" value="yes"${attrs(
          { required: form.consent.required !== false },
        )} /><span>${esc(form.consent.text || 'I agree to be contacted about this enquiry.')}</span></label></div>`
      : '';

  return `<form class="bz-form" method="post" action="/${esc(prefix)}/forms/${esc(form.id)}"${attrs({
    id: `form-${form.id}`,
    'data-bz-form': form.id,
    'data-bz-success': form.successMessage || 'Thanks — we will be in touch shortly.',
    'data-bz-redirect': form.redirectUrl || null,
    // The form's analytics annotations ride on the element rather than being
    // looked up by the runtime: the runtime has no access to the form
    // definition, and a second copy of the mapping is a second thing to get
    // wrong. The bag is opaque here and in the runtime — a provider's adapter
    // is the only thing that knows what its keys mean, or that one of them is
    // required and needs a default.
    'data-bz-analytics': analyticsBag(form.analytics),
    // The vehicle a form on or near a VDP is bound to, baked in at build time
    // from the page's product context. Not hidden inputs: a hidden field is a
    // field, and a bot can rewrite one. The server re-resolves it anyway.
    'data-bz-vehicle': form.vehicle ? JSON.stringify(form.vehicle) : null,
    ...tagAttrs('form', form.intent || `form-${form.id}`),
  })}>
  <p class="bz-form__t">${esc(form.name || 'Contact us')}</p>
${fields}
${consent}
  <div class="bz-field bz-field--hp" aria-hidden="true"><label for="${esc(
    form.id,
  )}-hp">Leave this empty</label><input id="${esc(
    form.id,
  )}-hp" name="_hp" tabindex="-1" autocomplete="off" /></div>
  <button class="bz-btn bz-btn--primary" type="submit"${attrs(
    tagAttrs('cta', form.intent || `submit-${form.id}`),
  )}>${esc(form.submitLabel || 'Submit')}</button>
  <p class="bz-form__status" role="status" aria-live="polite"></p>
</form>`;
}
