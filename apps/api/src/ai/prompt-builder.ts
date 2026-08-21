import type { DraftContext, BuiltPrompt, PromptLayer } from './types';

/**
 * AiDraftPromptBuilder (SPRINT 009) — PURE and DETERMINISTIC.
 *
 * Builds a LAYERED prompt (system rules → business context → opportunity →
 * matching reasons → prohibited claims → tone → output contract). Higher layers
 * are authoritative: safety rules sit structurally above business voice, which
 * sits above the individual post (docs/09-ai-design.md). It requests NO hidden
 * reasoning / chain-of-thought and NEVER embeds secrets.
 */

export const PROMPT_VERSION = 'rules-v2-property';

function joinLines(lines: (string | null | undefined)[]): string {
  return lines.filter((l): l is string => typeof l === 'string' && l.length > 0).join('\n');
}

export function buildDraftPrompt(context: DraftContext, maxLength: number): BuiltPrompt {
  const b = context.business;

  const systemRules = joinLines([
    'You write a single, short, natural public Facebook Group comment on behalf of a business.',
    'This is a DRAFT for human review only. You never send, post, or take any action.',
    'Absolute rules (highest priority, never overridden):',
    '- Use ONLY the business context provided below. Never invent facts.',
    '- Never state confirmed availability, a confirmed price, a promotion, a facility,',
    '  a location, contact details, or service terms that are not present in the context.',
    '- Never make any prohibited claim listed below.',
    '- If information is missing, stay general and truthful; do not guess.',
    '- Produce a proposal only; a human approves before anything is posted.',
  ]);

  const businessContext = joinLines([
    `Business name: ${b.name}`,
    b.category ? `Category: ${b.category}` : null,
    b.description ? `Description: ${b.description}` : null,
    b.sellingPoints.length ? `Selling points: ${b.sellingPoints.join('; ')}` : null,
    b.serviceArea ? `Service area: ${b.serviceArea}` : null,
    b.contactInformation ? `Contact (verbatim, only if relevant): ${b.contactInformation}` : null,
    context.knowledge.length
      ? `Knowledge:\n${context.knowledge.map((k) => `- ${k.title}: ${k.content}`).join('\n')}`
      : null,
  ]);

  const opportunityContext = joinLines([
    `Poster's message: ${context.signal.message ?? '(none)'}`,
    `Source group: ${context.signal.group.name ?? '(unknown)'}`,
    `Opportunity decision: ${context.opportunity.decision}`,
  ]);

  const matchingReasons = joinLines([
    'Why this business was matched (deterministic rules):',
    ...context.matchingReasons
      .filter((r) => r.matched)
      .map((r) => `- ${r.ruleType}: ${r.ruleValue}`),
  ]);

  // SPRINT 016B — Property Facts layer. Only STORED facts appear; when there is
  // no matching Property, the draft must make no Property-specific claim.
  const p = context.property;
  const propertyFacts = context.noPropertyMatch
    ? joinLines([
        'Property match: NONE.',
        'No specific accommodation matched this request. Do NOT describe, name, or imply any',
        'specific property, room, price, or availability. Respond only at the business level',
        'and invite the poster to share more detail or contact the business.',
      ])
    : p
      ? joinLines([
          'Matched property (use ONLY these stored facts — never add or infer others):',
          `- Name: ${p.name}`,
          p.area ? `- Area: ${p.area}` : null,
          p.propertyType ? `- Type: ${p.propertyType}` : null,
          p.maxGuests != null ? `- Max guests: ${p.maxGuests}` : null,
          p.bedrooms != null ? `- Bedrooms: ${p.bedrooms}` : null,
          p.amenities.length ? `- Amenities: ${p.amenities.join(', ')}` : null,
          p.priceFact ? `- Price (only as stated): ${p.priceFact}` : null,
          p.sellingPoints.length ? `- Selling points: ${p.sellingPoints.join('; ')}` : null,
        ])
      : null;

  const mustNotClaim = context.mustNotClaim.length
    ? joinLines([
        'Must NOT claim (hard constraints — the draft may never state any of these):',
        ...context.mustNotClaim.map((c) => `- ${c}`),
      ])
    : null;

  const approvedContacts = context.approvedContacts.length
    ? joinLines([
        'Approved contact channels (the ONLY channels you may mention, verbatim):',
        ...context.approvedContacts.map(
          (c) => `- ${c.type}: ${c.value}${c.label ? ` (${c.label})` : ''}`,
        ),
      ])
    : joinLines([
        'Approved contact channels: NONE approved for drafts. Do NOT state any phone,',
        'LINE, email, website, or page — invite the poster to contact the business generally.',
      ]);

  const prohibitedClaims = joinLines([
    'Prohibited claims (hard constraints — never state any of these):',
    ...(context.prohibitedClaims.length
      ? context.prohibitedClaims.map((c) => `- ${c}`)
      : ['- (none specified; still never fabricate guarantees, prices, or promotions)']),
  ]);

  const toneInstructions = joinLines([
    `Tone: ${b.responseTone ?? 'friendly and professional'} — but tone never overrides the rules above.`,
  ]);

  const outputContract = joinLines([
    'Output contract:',
    '- Exactly one concise Facebook comment draft.',
    '- Natural Thai by default.',
    '- Plain text only: no markdown, no bullet lists.',
    '- No fabricated facts; no guaranteed availability; no guaranteed price.',
    '- No aggressive sales claims; no guessing personal data; no duplicate contact spam.',
    '- A safe, gentle call to action (invite the poster to ask for more detail).',
    `- Maximum length: ${maxLength} characters.`,
    'Return ONLY the comment text. Do not include reasoning, explanations, or metadata.',
  ]);

  const layers: PromptLayer[] = [
    { label: 'System Rules', content: systemRules },
    { label: 'Business Context', content: businessContext },
    ...(propertyFacts ? [{ label: 'Property Facts', content: propertyFacts }] : []),
    { label: 'Opportunity Context', content: opportunityContext },
    { label: 'Matching Reasons', content: matchingReasons },
    { label: 'Prohibited Claims', content: prohibitedClaims },
    ...(mustNotClaim ? [{ label: 'Must Not Claim', content: mustNotClaim }] : []),
    { label: 'Approved Contacts', content: approvedContacts },
    { label: 'Tone Instructions', content: toneInstructions },
    { label: 'Output Contract', content: outputContract },
  ];

  const text = layers.map((l) => `### ${l.label}\n${l.content}`).join('\n\n');

  return { promptVersion: PROMPT_VERSION, layers, text, maxLength };
}
