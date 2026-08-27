// Mirrors the parsing/reduction logic in variant_scoring.py so the frontend
// never re-derives its own, possibly-drifting interpretation of the same
// raw dbNSFP fields. Kept deliberately dependency-free (plain functions) so
// it can be imported by the drawer, the table, and any future component
// without pulling in extra state.

const CLINVAR_TIER = {
  'pathogenic': 40, 'likely pathogenic': 30, 'uncertain significance': 15,
  'conflicting classifications of pathogenicity': 15, 'likely benign': 5, 'benign': 0,
}
const CLINVAR_OTHER_TERMS = new Set(['risk factor', 'association', 'drug response', 'affects', 'other'])

const REVIEW_STARS = {
  'practice_guideline': 4,
  'reviewed_by_expert_panel': 3,
  'criteria_provided,_multiple_submitters,_no_conflicts': 2,
  'criteria_provided,_single_submitter': 1,
  'criteria_provided,_conflicting_classifications': 1,
  'no_assertion_criteria_provided': 0,
  'no_classification_provided': 0,
  'no_classification_for_the_single_variant': 0,
  'no_classifications_from_unflagged_records': 0,
}

/** clinvar_clnsig uses '/' for combined calls and '|' for multi-category calls. */
export function splitClinvarTerms(raw) {
  if (!raw) return []
  const normalized = raw.replace(/_/g, ' ').trim()
  const terms = []
  for (const chunk of normalized.split('|')) {
    terms.push(...chunk.split('/'))
  }
  return terms.map(t => t.trim().toLowerCase()).filter(Boolean)
}

/** Structured breakdown for display — severity terms, other-category terms, conflict flag, star rating. */
export function assessClinvar(clnsig, review) {
  const terms = splitClinvarTerms(clnsig)
  const severityTerms = terms.filter(t => t in CLINVAR_TIER)
  const otherTerms = terms.filter(t => CLINVAR_OTHER_TERMS.has(t))
  const conflicting = terms.includes('conflicting classifications of pathogenicity') ||
    (review || '').includes('conflicting_classifications')
  const stars = review && review.trim() in REVIEW_STARS ? REVIEW_STARS[review.trim()] : null
  return { severityTerms, otherTerms, conflicting, stars, hasRecord: severityTerms.length > 0 || otherTerms.length > 0 }
}

/** dbNSFP repeats scores per overlapping transcript, ';'-delimited, '.' = not applicable. */
export function parseMultiValue(raw) {
  if (raw === null || raw === undefined) return []
  return String(raw).split(';')
    .map(s => s.trim())
    .filter(s => s !== '' && s !== '.')
    .map(Number)
    .filter(n => !isNaN(n))
}

/** Worst-case (max) value across transcripts — matches variant_scoring.py's max_transcript_score. */
export function maxTranscriptValue(raw) {
  const vals = parseMultiValue(raw)
  return vals.length ? Math.max(...vals) : null
}

/** First categorical prediction (AlphaMissense_pred etc. don't have a numeric "worst case"). */
export function firstCategorical(raw) {
  if (!raw) return null
  const first = String(raw).split(';')[0].trim()
  return first === '.' || first === '' ? null : first
}

/**
 * Builds a per-transcript table from a raw dbNSFP row, for the drawer's
 * "show all transcripts" toggle — the reduced (max) values are what scoring
 * uses; this is the full picture behind that reduction.
 */
export function buildTranscriptTable(fn) {
  if (!fn) return []
  const cadd = String(fn.CADD_phred ?? '').split(';')
  const revel = String(fn.REVEL_score ?? '').split(';')
  const am = String(fn.AlphaMissense_pred ?? '').split(';')
  const sift = String(fn.SIFT_score ?? '').split(';')
  const n = Math.max(cadd.length, revel.length, am.length, sift.length, 1)
  const rows = []
  for (let i = 0; i < n; i++) {
    const row = {
      cadd: cadd[i]?.trim() || '.',
      revel: revel[i]?.trim() || '.',
      alphamissense: am[i]?.trim() || '.',
      sift: sift[i]?.trim() || '.',
    }
    if (row.cadd !== '.' || row.revel !== '.' || row.alphamissense !== '.' || row.sift !== '.') {
      rows.push(row)
    }
  }
  return rows
}

const POPULATION_LABELS = [
  'GnomAD_MAF', 'Genomes1000_MAF', 'TOPMED_MAF', 'ExAC_MAF', 'GnomAD_exomes_MAF',
  'dbGaP_PopFreq_MAF', 'KOREAN_MAF', 'SGDP_PRJ_MAF', 'Qatari_MAF', 'NorthernSweden_MAF',
  'Siberian_MAF', 'TWINSUK_MAF', 'TOMMO_MAF', 'ALSPAC_MAF', 'GENOME_DK_MAF', 'GoNL_MAF',
  'Estonian_MAF', 'Vietnamese_MAF', 'Korea1K_MAF', 'HapMap_MAF', 'HGDP_Stanford_MAF',
  'PAGE_STUDY_MAF', 'Chileans_MAF', 'MGP_MAF', 'FINRISK_MAF', 'PharmGKB_MAF',
]

/** Extracts every non-null population MAF column from a common-track row into a flat list. */
export function extractFrequencies(common) {
  if (!common) return []
  return POPULATION_LABELS
    .filter(k => common[k] !== null && common[k] !== undefined)
    .map(k => ({ label: k.replace('_MAF', ''), value: common[k] }))
}

/**
 * Normalizes lookup_variant()'s nested payload shape (single-rsid mode)
 * into the drawer's common detail shape.
 */
export function adaptLookupVariant(variant) {
  const data = variant.payload?.data || {}
  const common = data.common || {}
  const fn = data.functional || {}
  const clinvar = assessClinvar(fn.clinvar_clnsig, fn.clinvar_review)

  return {
    rsid: variant.rsid || null,
    chrom: common.chrom || fn.chromosome || null,
    pos: common.chromStart != null ? common.chromStart + 1 : (fn.position ?? null),
    ref: common.ref || fn.ref || null,
    alt: common.alts || fn.alt || null,
    gene: fn.genename ? [...new Set(fn.genename.split(';').map(g => g.trim()).filter(Boolean))].join(', ')
      : (data.genes?.[0] || null),
    clinvar: { ...clinvar, reviewRaw: fn.clinvar_review || null, traitRaw: fn.clinvar_trait || null },
    functional: {
      cadd: maxTranscriptValue(fn.CADD_phred),
      revel: maxTranscriptValue(fn.REVEL_score),
      alphamissensePred: firstCategorical(fn.AlphaMissense_pred),
      sift: maxTranscriptValue(fn.SIFT_score),
      transcripts: buildTranscriptTable(fn),
    },
    frequencies: extractFrequencies(common),
    warnings: [],
    alleleMismatch: false,
    sourcesFound: variant.payload?.sources_found || [],
  }
}

/**
 * Normalizes a flat batch-pipeline row (from bulk_annotate.py / the
 * leaderboard) into the same detail shape. Batch rows are already-reduced
 * summaries — richer detail (raw transcripts, full frequency list) is
 * layered in separately via mergeDeepDetail() once the on-demand fetch
 * resolves, not derivable from the summary row alone.
 */
export function adaptBatchRow(row) {
  const clinvar = assessClinvar(row.clinvar_sig, null)
  return {
    rsid: row.rsid || null,
    chrom: row.chrom, pos: row.pos, ref: row.ref || null, alt: row.alt || null,
    gene: row.gene || null,
    clinvar: {
      ...clinvar,
      stars: row.clinvar_stars ?? clinvar.stars,
      conflicting: row.clinvar_conflicting ?? clinvar.conflicting,
      reviewRaw: null, traitRaw: null,
    },
    functional: { cadd: row.cadd, revel: null, alphamissensePred: null, sift: null, transcripts: [] },
    frequencies: row.maf != null ? [{ label: row.maf_source || 'MAF', value: row.maf }] : [],
    warnings: row.warnings || [],
    alleleMismatch: !!row.allele_mismatch,
    sourcesFound: [],
    priority: row.priority,
  }
}

/** Merges the on-demand /variant/<chrom>/<pos>/<alt> deep-lookup response into an adapted detail object. */
export function mergeDeepDetail(base, deep) {
  if (!deep || !deep.found) return { ...base, deepLookupMissing: true }
  const fn = deep.dbnsfp_primary || {}
  const clinvar = assessClinvar(fn.clinvar_clnsig, fn.clinvar_review)
  return {
    ...base,
    clinvar: { ...clinvar, reviewRaw: fn.clinvar_review || null, traitRaw: fn.clinvar_trait || null },
    functional: {
      cadd: deep.score?.cadd ?? maxTranscriptValue(fn.CADD_phred),
      revel: deep.score?.revel ?? maxTranscriptValue(fn.REVEL_score),
      alphamissensePred: firstCategorical(fn.AlphaMissense_pred),
      sift: maxTranscriptValue(fn.SIFT_score),
      transcripts: (deep.dbnsfp_all_transcripts || []).map(t => ({
        cadd: t.CADD_phred, revel: t.REVEL_score, alphamissense: t.AlphaMissense_pred, sift: t.SIFT_score,
        gene: t.genename,
      })),
    },
    frequencies: extractFrequencies(deep.common),
    priority: deep.score?.priority ?? base.priority,
  }
}