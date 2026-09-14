'use strict';

// HPLC. Describes the separation, the detector, and the parameters that
// determine what the reported percentage actually covers. No claim is made
// about what any purity figure implies beyond the measurement itself.

module.exports = {
  slug: 'what-hplc-testing-measures',
  title: 'What HPLC Testing Measures in Research Compounds',
  metaTitle: 'What HPLC Testing Measures in Research Compounds | PepX Research',
  metaDescription:
    'How reversed-phase HPLC separates a sample, what an area percentage covers, ' +
    'and which method parameters change the purity figure on a certificate.',
  excerpt:
    'How reversed-phase HPLC separates a sample, what the area percentage on a ' +
    'certificate is actually measuring, and which method details change the number.',
  category: 'Testing & Quality',
  datePublished: '2026-09-14',
  status: 'published',
  body: [
    { p: [
      'High-performance liquid chromatography, almost always written as HPLC, is the method ' +
      'behind the purity percentage on a peptide certificate of analysis. It is a separation ' +
      'technique: it pulls a mixture apart so that the components can be detected one at a ' +
      'time, and it reports how much of the detector response each component accounted for.'
    ] },
    { p: [
      'Knowing what the instrument does makes the reported number easier to interpret, and ' +
      'makes the limits of that number easier to see.'
    ] },

    { h2: 'How the separation works' },
    { p: [
      'A small volume of dissolved sample is injected into a stream of solvent, the mobile ' +
      'phase, which is pumped at high pressure through a packed column, the stationary ' +
      'phase. Components in the sample interact with the column material to different ' +
      'degrees. The more strongly a component is retained, the later it leaves the column. ' +
      'That difference in retention is what separates the mixture.'
    ] },
    { p: [
      'Peptides are usually run in reversed-phase mode. The column packing is nonpolar, ' +
      'commonly a C18 material, and the mobile phase is a mixture of water and an organic ' +
      'solvent such as acetonitrile, typically with a small amount of acid added. More ' +
      'hydrophobic components are retained longer.'
    ] },

    { h3: 'Gradient and isocratic runs' },
    { p: [
      'Most peptide methods use a gradient: the proportion of organic solvent increases ' +
      'through the run, releasing progressively more hydrophobic components in turn. An ' +
      'isocratic run holds the mixture constant. A certificate that names the gradient is ' +
      'describing the conditions under which the separation was achieved, which is part of ' +
      'what makes the result reproducible.'
    ] },

    { h2: 'What the detector records' },
    { p: [
      'As each separated component leaves the column it passes a detector. For peptides this ' +
      'is normally an ultraviolet detector, and the output is a chromatogram: detector ' +
      'response plotted against time, with each component appearing as a peak.'
    ] },
    { p: [
      'Two axes carry different information. The horizontal position of a peak is its ' +
      'retention time, which relates to how the component interacted with the column. The ' +
      'area under the peak relates to how much detector response that component produced.'
    ] },

    { h3: 'Why the wavelength matters' },
    { p: [
      'Peptide methods commonly detect at 214 nm or 220 nm. At those wavelengths the peptide ' +
      'backbone itself absorbs, so the detector responds to essentially any peptide present ' +
      'rather than only to those containing particular residues. Detection at 280 nm relies ' +
      'on aromatic side chains, which many peptides do not have.'
    ] },
    { p: [
      'The consequence is that the reported percentage is an area percentage at a stated ' +
      'wavelength. It describes the share of response among species that absorbed at that ' +
      'wavelength, and a certificate that states the wavelength is telling you the scope of ' +
      'the figure.'
    ] },

    { h2: 'How the percentage is calculated' },
    { p: [
      'The area of the main peak is divided by the summed area of all integrated peaks in ' +
      'the run, and the result is expressed as a percentage. It is a relative figure: it ' +
      'compares the main component against the other things the detector saw.'
    ] },
    { ul: [
      [
        'Material that does not absorb at the detection wavelength does not contribute. ' +
        'Water, many salts and counterion residues fall into this category.'
      ],
      [
        'Material retained so weakly that it elutes with the solvent front, or so strongly ' +
        'that it does not leave the column during the run, is not counted either.'
      ],
      [
        'Integration decisions, such as where a peak is judged to start and end and how a ' +
        'shoulder is integrated, affect the arithmetic.'
      ]
    ] },
    { note: [
      'An HPLC purity percentage is a statement about relative detector response under one ' +
      'method. It is not a measure of the mass fraction of the vial contents, and it does ' +
      'not establish the identity of the peak that produced it.'
    ] },

    { h2: 'What HPLC does not answer' },
    { p: [
      'Chromatography separates by physical behaviour, not by identity. A peak tells you ' +
      'that something eluted at a particular time and produced a particular response; it ' +
      'does not name the molecule. Two different compounds with similar interactions with ' +
      'the column can appear at similar retention times.'
    ] },
    { p: [
      'That is why certificates pair chromatography with a mass measurement. ',
      { href: '/blog/mass-spectrometry-compound-identification', text: 'Mass spectrometry' },
      ' addresses which molecule is present, and ',
      { href: '/blog/peptide-purity-vs-identity-testing', text: 'purity and identity testing' },
      ' covers why the two results are reported separately. Where the two techniques are ' +
      'coupled, written as LC-MS, components are separated by chromatography and then ' +
      'measured by mass in the same run.'
    ] },

    { h2: 'Reading an HPLC section on a certificate' },
    { ol: [
      ['Which wavelength was used for detection?'],
      ['Was the run a gradient or isocratic, and over what time?'],
      ['What column and mobile phase are named?'],
      ['Is a chromatogram included, so the summary figure can be checked against the trace?'],
      ['Does the baseline return cleanly between peaks, or are peaks merging?']
    ] },
    { p: [
      { href: '/blog/how-to-read-a-certificate-of-analysis', text: 'How to read a certificate of analysis' },
      ' covers the surrounding sections of the document, and published certificates for ' +
      'compounds in our catalogue are on the ',
      { href: '/coas.html', text: 'certificates of analysis page' },
      '.'
    ] },
    { note: [
      'All compounds and research materials supplied by PepX Research are for laboratory and ' +
      'research use only. They are not for human consumption.'
    ] }
  ]
};
