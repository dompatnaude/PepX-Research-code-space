'use strict';

// Third-party testing. The compliance-sensitive one: the entire point is to
// state precisely what independence adds and to separate it explicitly from
// regulatory approval, safety and suitability.

module.exports = {
  slug: 'what-third-party-testing-means',
  title: 'What Third-Party Testing Actually Means',
  metaTitle: 'What Third-Party Testing Actually Means | PepX Research',
  metaDescription:
    'Third-party testing means an independent laboratory performed the analysis. ' +
    'What independence adds, what accreditation covers, and what the term does not mean.',
  excerpt:
    'Third-party testing describes who performed an analysis, not what the result ' +
    'proves. What independence adds, what accreditation covers, and the claims the term is ' +
    'often mistaken for.',
  category: 'Testing & Quality',
  datePublished: '2026-09-14',
  status: 'published',
  body: [
    { p: [
      'Third-party tested is one of the most common phrases in research compound listings ' +
      'and one of the least specific. It describes who performed an analysis. On its own it ' +
      'says nothing about which tests were run, on what material, or what the results were.'
    ] },
    { p: [
      'The phrase is worth taking literally, because read literally it is useful, and read ' +
      'loosely it is often taken to mean things it does not.'
    ] },

    { h2: 'First, second and third party' },
    { p: [
      'The numbering describes the relationship between whoever performs a test and whoever ' +
      'has an interest in the outcome.'
    ] },
    { ul: [
      ['First-party testing is performed by the producer of the material, on its own product.'],
      ['Second-party testing is performed by a party with a direct interest, such as a purchaser testing what it has bought.'],
      ['Third-party testing is performed by an independent laboratory with no stake in the result.']
    ] },
    { p: [
      'The distinction is structural rather than technical. The same instrument running the ' +
      'same method produces the same measurement in all three cases. What changes is whether ' +
      'the party reporting the number benefits from what it says.'
    ] },

    { h2: 'What independence adds' },
    { p: [
      'Independence addresses a specific weakness in self-reported data: the party that ' +
      'generated a result is also the party that decides whether to publish it, and how to ' +
      'present it. An independent laboratory reports to its own procedures.'
    ] },
    { p: [
      'That is a meaningful improvement in the evidentiary value of a result. It is also a ' +
      'narrow one. Independence speaks to the credibility of the reporting, not to the ' +
      'scope of what was measured. An independent laboratory reporting a purity figure is ' +
      'still reporting only a purity figure.'
    ] },

    { h2: 'What accreditation covers' },
    { p: [
      'Some laboratories are accredited to ISO/IEC 17025, the international standard for the ' +
      'competence of testing and calibration laboratories. Accreditation is an assessment by ' +
      'an accreditation body that a laboratory operates a competent system: appropriate ' +
      'methods, calibrated equipment, qualified personnel, traceable records and handling of ' +
      'measurement uncertainty.'
    ] },
    { p: [
      'Two qualifications matter when reading an accreditation claim. Accreditation is ' +
      'granted for a defined scope, so a laboratory may be accredited for some methods and ' +
      'not others, and the relevant question is whether the specific test performed falls ' +
      'inside that scope. And accreditation assesses the laboratory, not the material it ' +
      'tested.'
    ] },

    { h2: 'The chain between material and result' },
    { p: [
      'A laboratory analyses the sample it receives. Everything upstream of that sample is ' +
      'outside what the report can speak to.'
    ] },
    { ul: [
      [
        'Which batch the sample came from, and whether it was representative of that batch, ' +
        'is a question about sampling rather than about the analysis.'
      ],
      [
        'A report describes the sample as received on a date. It does not extend to material ' +
        'produced later, or to a different batch of the same compound.'
      ],
      [
        'The link between the report and a specific container runs through the batch ' +
        'identifier, which is why ',
        { href: '/blog/batch-numbers-research-compound-documentation', text: 'batch numbers and documentation' },
        ' are part of the same picture.'
      ]
    ] },

    { h2: 'What third-party testing does not mean' },
    { p: [
      'This is where the phrase most often does work it is not entitled to do. Independent ' +
      'testing carries none of the following.'
    ] },
    { ul: [
      [
        'It is not regulatory approval. An accreditation body assesses laboratory ' +
        'competence. Neither accreditation nor an independent test result constitutes ' +
        'approval, authorisation or endorsement by any regulatory agency.'
      ],
      [
        'It is not a safety assessment. Identity and purity measurements characterise ' +
        'composition. They are not evaluations of what a compound does, and they do not ' +
        'establish that material is suitable for human consumption or any other use.'
      ],
      [
        'It is not a statement about effectiveness. Analytical chemistry describes what is ' +
        'in a sample. Questions about biological activity are answered by entirely different ' +
        'studies.'
      ],
      [
        'It is not a blanket claim. A report covers the tests named on it. Properties that ' +
        'were not tested are simply not addressed.'
      ]
    ] },
    { note: [
      'The correct reading of an independent report is narrow and specific: this laboratory, ' +
      'independent of the supplier, ran these named methods on this sample, and obtained ' +
      'these results. Every further inference belongs to the reader and is not supported by ' +
      'the document.'
    ] },

    { h2: 'Checking a third-party claim' },
    { p: [
      'A claim of independent testing can be checked against the document it refers to.'
    ] },
    { ol: [
      ['Is the testing laboratory named on the certificate, and is it a different organisation from the supplier?'],
      ['Does the certificate carry a batch identifier that matches the material?'],
      ['Which methods were run? Identity and purity are ',
        { href: '/blog/peptide-purity-vs-identity-testing', text: 'separate measurements' },
        ' and a certificate may report one, the other, or both.'],
      ['Are the underlying figures included, such as a chromatogram or a spectrum, rather than only a summary table?'],
      ['If accreditation is claimed, is a scope or accreditation number given?']
    ] },
    { p: [
      'The methods themselves are worth understanding when reading the results: ',
      { href: '/blog/what-hplc-testing-measures', text: 'what HPLC testing measures' },
      ' and ',
      { href: '/blog/mass-spectrometry-compound-identification', text: 'what mass spectrometry is used for' },
      ' cover the two that appear most often.'
    ] },

    { h2: 'Where PepX Research certificates are published' },
    { p: [
      'Published certificates are listed on the ',
      { href: '/coas.html', text: 'certificates of analysis page' },
      ', filed against the product and batch they describe. A certificate appears there once ' +
      'independent testing for that batch has been completed and the report issued, so the ' +
      'page reflects what has actually been tested rather than a blanket claim. ',
      { href: '/blog/how-to-read-a-certificate-of-analysis', text: 'How to read a certificate of analysis' },
      ' walks through the document itself.'
    ] },
    { note: [
      'All compounds and research materials supplied by PepX Research are for laboratory and ' +
      'research use only. They are not for human consumption.'
    ] }
  ]
};
