'use strict';

// Batch and lot identifiers. The argument is that a certificate describes one
// batch, so the identifier is what connects a document to material. Strictly
// about traceability and documentation.

module.exports = {
  slug: 'batch-numbers-research-compound-documentation',
  title: 'Understanding Batch Numbers and Research Compound Documentation',
  metaTitle: 'Batch Numbers and Research Compound Documentation | PepX Research',
  metaDescription:
    'A batch number is what connects a certificate of analysis to the material it ' +
    'describes. How batches and lots are defined, and why the identifier has to match.',
  excerpt:
    'A certificate describes one batch, not a product line. How batches and lots are ' +
    'defined, what a batch identifier is for, and why a document without a matching number ' +
    'describes something else.',
  category: 'Documentation',
  datePublished: '2026-09-14',
  status: 'published',
  body: [
    { p: [
      'Analytical results describe the sample that was tested. Connecting those results to a ' +
      'specific container of material is the job of the batch number, and it is the reason ' +
      'batch identifiers appear on labels, certificates and records.'
    ] },
    { p: [
      'Without a matching identifier, a certificate is a document about some material rather ' +
      'than a document about the material in front of you.'
    ] },

    { h2: 'What a batch is' },
    { p: [
      'A batch is a quantity of material produced in a single run under one set of ' +
      'conditions, intended to be uniform throughout. Everything in a batch comes from the ' +
      'same synthesis, the same purification and the same processing, so a sample drawn from ' +
      'it is taken to represent the rest.'
    ] },
    { p: [
      'That assumption of uniformity is what makes testing practical. A laboratory analyses ' +
      'a portion of the batch and the result is taken as describing the batch, which only ' +
      'holds because the batch was produced as one homogeneous quantity.'
    ] },

    { h3: 'Batch and lot' },
    { p: [
      'The two terms are often used interchangeably, and in many settings they are the same ' +
      'thing. Where a distinction is drawn, a lot is a defined portion of a batch: for ' +
      'example, one batch divided and filled into vials across several sessions may be ' +
      'tracked as separate lots. The practical point is that whichever term is used, it ' +
      'refers to a defined quantity of material with its own identifier. Batch number, lot ' +
      'number and batch identifier are all names for that label, and this article uses batch ' +
      'identifier where the distinction between the two terms does not matter.'
    ] },

    { h2: 'What the identifier is for' },
    { p: [
      'A batch identifier exists so that a specific quantity of material can be traced ' +
      'through the records that describe it.'
    ] },
    { ul: [
      ['It links material to the analytical results generated from it.'],
      ['It links material to its date of manufacture and, where stated, a retest or expiry date.'],
      ['It allows a specific quantity to be identified precisely if a question is raised later.'],
      ['It distinguishes one production run from another run of the same compound.']
    ] },
    { p: [
      'The last point is the one most often overlooked. Two batches of the same compound are ' +
      'separate material with separate results. A certificate for one batch does not describe ' +
      'the other, however similar the two may be.'
    ] },

    { h2: 'Matching the document to the material' },
    { p: [
      'The first check when reading any certificate is whether the batch identifier on the ' +
      'document matches the identifier on the container. It sounds trivial, and it is the ' +
      'step that determines whether anything else on the page is relevant.'
    ] },
    { ol: [
      ['Does the batch or lot number on the certificate match the label exactly?'],
      ['Does the compound name on the certificate match the label?'],
      ['Is the certificate the current revision, if a revision number is present?'],
      ['Does the issue date sit sensibly relative to the date of manufacture?'],
      ['Do the methods named account for each result reported?']
    ] },
    { note: [
      'A certificate describes one batch analysed on one date. It is not a statement about a ' +
      'product line, about later batches, or about material whose identifier does not appear ' +
      'on the document.'
    ] },

    { h3: 'Retention samples and retest dates' },
    { p: [
      'Two further items are often tied to a batch identifier. A retention sample is a ' +
      'portion of the batch held back after release, so that material from the original run ' +
      'remains available if a question comes up once the rest has been distributed.'
    ] },
    { p: [
      'A retest date differs from an expiry date. An expiry date marks the end of the period ' +
      'the material is considered fit for its stated purpose. A retest date marks the point ' +
      'at which material should be re-analysed to establish its current condition rather ' +
      'than assumed to be unchanged. Which of the two appears, if either, depends on the ' +
      'material and the supplier.'
    ] },

    { h2: 'What documentation covers, and what it does not' },
    { p: [
      'Records of this kind establish traceability: which material this is, where it came ' +
      'from, and what was measured on it. That is a narrower claim than it is sometimes ' +
      'taken for.'
    ] },
    { ul: [
      [
        'Documentation records the results of the tests that were performed. It says nothing ' +
        'about properties that were not tested.'
      ],
      [
        'A complete and well-kept record does not by itself establish that a compound is ' +
        'suitable for any particular purpose. It establishes what was measured, by whom, on ' +
        'which material.'
      ],
      [
        'Testing performed by an independent laboratory is a statement about who did the ' +
        'analysis, not about regulatory status. ',
        { href: '/blog/what-third-party-testing-means', text: 'What third-party testing actually means' },
        ' covers that distinction.'
      ]
    ] },

    { h2: 'Keeping records usable' },
    { p: [
      'Documentation is only as useful as the link between the paperwork and the physical ' +
      'material. A few habits preserve that link.'
    ] },
    { ul: [
      ['Record the batch identifier wherever results or observations are logged.'],
      ['Keep the certificate with, or clearly referenced against, the material it belongs to.'],
      ['Where a container is subdivided, carry the original batch identifier onto every label.'],
      ['Note the date material was received, which is not always the date it was manufactured.']
    ] },
    { p: [
      { href: '/blog/how-to-read-a-certificate-of-analysis', text: 'How to read a certificate of analysis' },
      ' goes through the sections of the document itself. Published certificates for ' +
      'compounds in our catalogue are on the ',
      { href: '/coas.html', text: 'certificates of analysis page' },
      ', where each one is filed against the product and batch it belongs to.'
    ] },
    { note: [
      'All compounds and research materials supplied by PepX Research are for laboratory and ' +
      'research use only. They are not for human consumption.'
    ] }
  ]
};
