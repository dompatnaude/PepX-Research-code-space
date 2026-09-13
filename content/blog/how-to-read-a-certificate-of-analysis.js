'use strict';

// Example article. Deliberately procedural: it describes how to read a
// laboratory document, and makes no claim about what any compound does, how it
// should be handled beyond generic laboratory practice, or what any particular
// result means for safety or efficacy.

module.exports = {
  slug: 'how-to-read-a-certificate-of-analysis',
  title: 'How to Read a Certificate of Analysis (COA)',
  metaTitle: 'How to Read a Certificate of Analysis (COA) | PepX Research',
  metaDescription:
    'What each section of a certificate of analysis contains, which analytical ' +
    'methods appear on one, and how to match a certificate to a batch.',
  excerpt:
    'A breakdown of common COA terminology, the analytical methods a certificate ' +
    'reports, and what each section of the document tells you about a research compound.',
  category: 'Testing & Quality',
  datePublished: '2026-09-10',
  status: 'published',
  body: [
    { p: [
      'A certificate of analysis, usually shortened to COA, is the document a laboratory ' +
      'produces when it finishes testing a sample. It is a record of what was tested, how it ' +
      'was tested, and what the instruments reported. Reading one is mostly a matter of ' +
      'knowing which section answers which question.'
    ] },
    { p: [
      'This guide walks through the sections that appear on most certificates. Published ' +
      'certificates for compounds in our catalogue are on the ',
      { href: '/coas.html', text: 'certificates of analysis page' },
      ', and each one is filed against the product and batch it belongs to.'
    ] },

    { h2: 'The header: what was tested, and when' },
    { p: [
      'The top of a certificate identifies the sample. Expect a product or compound name, ' +
      'a batch or lot identifier, the date the sample was received, and the date the report ' +
      'was issued. The laboratory that performed the work is normally named here too.'
    ] },
    { p: [
      'The batch identifier is the part that matters most in practice. A certificate ' +
      'describes one specific batch, not a product line, so a certificate only tells you ' +
      'about material from that batch. If the batch on the vial does not match the batch on ' +
      'the certificate, the document is describing something else.'
    ] },

    { h2: 'Identity: is this the compound it claims to be?' },
    { p: [
      'Identity testing answers a yes-or-no question. The most common method reported for ' +
      'peptides is mass spectrometry, usually written as MS, LC-MS or ESI-MS on the ' +
      'certificate. Mass spectrometry measures the mass-to-charge ratio of the molecules in ' +
      'the sample, which is compared against the mass expected from the compound’s ' +
      'molecular formula.'
    ] },
    { ul: [
      ['Expected mass or theoretical mass — what the named compound should weigh.'],
      ['Observed mass or found mass — what the instrument measured.'],
      ['A conclusion, often written as "conforms", "consistent with" or a pass/fail flag.']
    ] },
    { p: [
      'An identity section does not say anything about how much of the sample is the named ' +
      'compound. That is a separate measurement.'
    ] },

    { h2: 'Purity: how much of the sample is that compound?' },
    { p: [
      'Purity is normally reported from high-performance liquid chromatography, abbreviated ' +
      'HPLC. The technique separates the components of a sample as they pass through a ' +
      'column, and a detector records each component as a peak on a chromatogram. The area ' +
      'under the main peak, divided by the total area of all peaks, is reported as a ' +
      'percentage.'
    ] },
    { p: [
      'Two details are worth reading carefully. The first is the detection wavelength, often ' +
      'written as 214 nm or 220 nm, because the number is an area percentage at that ' +
      'wavelength rather than a measure of mass. The second is the method or gradient, which ' +
      'tells you the conditions the separation ran under.'
    ] },
    { note: [
      'Identity and purity answer different questions, and one does not substitute for the ' +
      'other. A sample can be the correct compound and still contain other material, and a ' +
      'high area percentage on its own does not confirm which compound produced the peak.'
    ] },

    { h2: 'Appearance, solubility and related observations' },
    { p: [
      'Many certificates record physical observations alongside the instrument results: the ' +
      'appearance of the material, whether it dissolved as expected in a stated solvent, and ' +
      'sometimes a water content figure from a Karl Fischer titration. These are descriptive ' +
      'observations of the sample as received.'
    ] },

    { h2: 'Chromatograms and spectra' },
    { p: [
      'A certificate often includes the raw output behind the summary numbers: an HPLC ' +
      'chromatogram, a mass spectrum, or both. The summary table is a reading of those ' +
      'figures, so the figures are what lets you check the reading. On a chromatogram, look ' +
      'at where the main peak sits relative to the run time and whether the baseline returns ' +
      'cleanly between peaks.'
    ] },

    { h2: 'Signatures, dates and revisions' },
    { p: [
      'The foot of a certificate normally carries the name or signature of the analyst or ' +
      'approver, the issue date, and sometimes a revision number. A revision number above ' +
      'one means the document was reissued, and the current revision is the one to read.'
    ] },

    { h2: 'A short checklist' },
    { ol: [
      ['Does the batch on the certificate match the batch on the material?'],
      ['Is the compound name on the certificate the compound you expected?'],
      ['Which method produced the identity result, and which produced the purity result?'],
      ['At what wavelength was the purity percentage measured?'],
      ['What is the issue date, and is this the current revision?']
    ] },

    { h2: 'Where to find certificates for PepX Research compounds' },
    { p: [
      'Published certificates are listed on the ',
      { href: '/coas.html', text: 'certificates of analysis page' },
      ', filterable by product. Certificates are added as third-party testing is completed, ' +
      'so coverage varies by product and batch. Each ',
      { href: '/shop', text: 'compound in the catalogue' },
      ' links to its own certificates where they exist.'
    ] },
    { note: [
      'All compounds and research materials supplied by PepX Research are for laboratory and ' +
      'research use only. They are not for human consumption.'
    ] }
  ]
};
