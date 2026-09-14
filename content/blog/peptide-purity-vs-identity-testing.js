'use strict';

// Purity vs identity. The point of the article is that the two results answer
// different questions and neither substitutes for the other. It describes what
// each measurement covers and, just as deliberately, what it does not.

module.exports = {
  slug: 'peptide-purity-vs-identity-testing',
  title: 'Understanding Peptide Purity vs Identity Testing',
  metaTitle: 'Peptide Purity vs Identity Testing Explained | PepX Research',
  metaDescription:
    'Purity and identity are separate measurements on a certificate of analysis. ' +
    'What each one tests, what it leaves open, and how to read them together.',
  excerpt:
    'Purity and identity are two different questions answered by two different ' +
    'instruments. What each measurement covers, and why a high number in one column says ' +
    'nothing about the other.',
  category: 'Testing & Quality',
  datePublished: '2026-09-14',
  status: 'published',
  body: [
    { p: [
      'Analytical reports for research peptides almost always carry two headline results: ' +
      'an identity result and a purity percentage. They are easy to read as a single ' +
      'verdict on quality, but they are produced by different instruments and they answer ' +
      'different questions. Neither one can stand in for the other.'
    ] },
    { p: [
      'Identity asks which molecule is in the vial. Purity asks how much of what is in the ' +
      'vial is that molecule. A sample can pass one and fail the other, and understanding ' +
      'the difference is most of what it takes to read an analytical report accurately.'
    ] },

    { h2: 'Identity: which molecule is this?' },
    { p: [
      'Identity testing compares a measured property of the sample against the value ' +
      'predicted from the molecular formula of the named compound. For peptides the usual ' +
      'method is mass spectrometry, which measures mass-to-charge ratio and lets an analyst ' +
      'calculate the molecular mass of the species present.'
    ] },
    { p: [
      'The report states an expected or theoretical mass, an observed or found mass, and a ' +
      'conclusion such as "conforms" or "consistent with". A match means the measured mass ' +
      'agrees with the mass the named compound should have, within the tolerance of the ' +
      'instrument. ',
      { href: '/blog/mass-spectrometry-compound-identification', text: 'What mass spectrometry is used for' },
      ' covers the method in more detail.'
    ] },
    { p: [
      'What identity testing does not tell you is proportion. A mass measurement can confirm ' +
      'that the expected molecule is present without describing how much of the material in ' +
      'the vial it accounts for. Mass agreement is a statement about the species detected, ' +
      'not about the composition of the sample as a whole.'
    ] },

    { h2: 'Purity: how much of the sample is that molecule?' },
    { p: [
      'Purity for peptides is normally reported from reversed-phase high-performance liquid ' +
      'chromatography. The sample is separated into its components as it passes through a ' +
      'column, a detector records each component as a peak, and the area under the main peak ' +
      'is divided by the total area of all peaks. The result is reported as a percentage. ',
      { href: '/blog/what-hplc-testing-measures', text: 'What HPLC testing measures' },
      ' goes through the method and the parameters that shape the number.'
    ] },
    { p: [
      'The figure is an area percentage at a stated detection wavelength, most often 214 nm ' +
      'or 220 nm. That detail matters, because the number describes relative detector ' +
      'response among the things the detector could see, not the mass fraction of the ' +
      'contents of the vial.'
    ] },

    { h2: 'Why one does not substitute for the other' },
    { p: [
      'The two results fail independently, which is the practical reason both appear on a ' +
      'report.'
    ] },
    { ul: [
      [
        'A sample can contain the correct compound and still contain a substantial amount ' +
        'of other material. Identity confirms the molecule; it does not bound the rest.'
      ],
      [
        'A sample can produce a single sharp chromatographic peak that is not the named ' +
        'compound. Chromatography separates by how strongly components interact with the ' +
        'column, so a different molecule with similar behaviour can occupy the same position ' +
        'in the run. A high area percentage describes the peak, not its identity.'
      ],
      [
        'Related substances such as deletion or truncation sequences can be chemically ' +
        'similar enough to elute close to the main peak, and differ in mass. Whether they ' +
        'are resolved depends on the separation method used.'
      ]
    ] },
    { note: [
      'Read together, the two results say that the expected molecule was detected and that ' +
      'the main chromatographic peak accounted for a stated share of the detector response. ' +
      'That is the whole of the claim. Neither result, alone or combined, describes how a ' +
      'compound behaves or establishes that it is suitable for any particular use.'
    ] },

    { h2: 'What a purity percentage does not describe' },
    { p: [
      'A common misreading is to read an HPLC purity figure as the percentage of the vial ' +
      'contents by weight. It is not. The percentage covers only material that the detector ' +
      'responded to under the conditions of that run.'
    ] },
    { ul: [
      [
        'Residual water, salts and counterions from synthesis and purification typically do ' +
        'not absorb at the detection wavelength, so they do not appear as peaks.'
      ],
      [
        'The share of vial mass that is peptide is a separate measurement, often called net ' +
        'peptide content, determined by methods such as amino acid analysis or nitrogen ' +
        'determination. It is a different number from chromatographic purity and is not ' +
        'always reported.'
      ],
      [
        'Residual moisture is sometimes reported separately from a Karl Fischer titration. ' +
        'It is a property of the material as received, not part of the purity calculation.'
      ]
    ] },

    { h2: 'Reading the two results together' },
    { p: [
      'A useful habit is to read each result as a sentence with an explicit scope. The ' +
      'identity line says: the mass observed for the detected species agrees with the mass ' +
      'expected for this compound. The purity line says: under this method, at this ' +
      'wavelength, the main peak accounted for this share of total peak area.'
    ] },
    { p: [
      'Stated that way, the limits are visible. Both sentences are about a specific sample ' +
      'analysed under specific conditions on a specific date. Neither extends to a product ' +
      'line, to a different batch, or to any question the instruments were not measuring.'
    ] },

    { h2: 'Where these results appear' },
    { p: [
      'Both results are reported on a certificate of analysis, alongside the batch they ' +
      'belong to and the methods used to produce them. ',
      { href: '/blog/how-to-read-a-certificate-of-analysis', text: 'How to read a certificate of analysis' },
      ' walks through the rest of the document, and published certificates for compounds in ' +
      'our catalogue are on the ',
      { href: '/coas.html', text: 'certificates of analysis page' },
      '.'
    ] },
    { note: [
      'All compounds and research materials supplied by PepX Research are for laboratory and ' +
      'research use only. They are not for human consumption.'
    ] }
  ]
};
