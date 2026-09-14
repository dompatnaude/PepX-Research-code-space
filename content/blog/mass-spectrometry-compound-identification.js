'use strict';

// Mass spectrometry. Describes ionisation, m/z, charge states, monoisotopic
// versus average mass, and the specific limits of a mass match. Makes no claim
// that a mass match establishes anything beyond mass agreement.

module.exports = {
  slug: 'mass-spectrometry-compound-identification',
  title: 'What Mass Spectrometry Is Used For in Compound Identification',
  metaTitle: 'Mass Spectrometry in Compound Identification | PepX Research',
  metaDescription:
    'How mass spectrometry measures mass-to-charge ratio, why peptides appear in ' +
    'several charge states, and what a mass match on a certificate does not show.',
  excerpt:
    'How a mass spectrometer measures mass-to-charge ratio, why peptides show up in ' +
    'several charge states, and what a mass match on a certificate establishes.',
  category: 'Testing & Quality',
  datePublished: '2026-09-14',
  status: 'published',
  body: [
    { p: [
      'Mass spectrometry is the method most often used to confirm the identity of a research ' +
      'peptide. On a certificate of analysis it usually appears as MS, LC-MS, ESI-MS or ' +
      'MALDI-TOF, followed by an expected mass, an observed mass and a short conclusion.'
    ] },
    { p: [
      'The technique measures one property precisely: the mass-to-charge ratio of ions ' +
      'produced from the sample. Everything on the identity line of a certificate follows ' +
      'from that single measurement, and so do its limits.'
    ] },

    { h2: 'What the instrument actually measures' },
    { p: [
      'A mass spectrometer does three things in sequence. It converts molecules from the ' +
      'sample into gas-phase ions, it separates those ions according to their mass-to-charge ' +
      'ratio, written as m/z, and it counts how many arrive at the detector at each ratio. ' +
      'The output is a spectrum: signal intensity plotted against m/z.'
    ] },
    { p: [
      'Note that the axis is a ratio, not a mass. Recovering the molecular mass requires ' +
      'knowing the charge on the ion, which is where the shape of a peptide spectrum ' +
      'becomes relevant.'
    ] },

    { h3: 'Ionisation methods' },
    { p: [
      'Two ionisation methods are common for peptides. Electrospray ionisation, written as ' +
      'ESI, sprays the sample from solution and tends to produce ions carrying several ' +
      'charges. Matrix-assisted laser desorption ionisation, usually paired with a ' +
      'time-of-flight analyser as MALDI-TOF, uses a laser pulse on a crystallised sample and ' +
      'commonly produces singly charged ions.'
    ] },

    { h2: 'Why one peptide produces several peaks' },
    { p: [
      'A peptide analysed by electrospray usually appears not as one peak but as a series. ' +
      'Each peak corresponds to the same molecule carrying a different number of protons, ' +
      'written as [M+H]+, [M+2H]2+, [M+3H]3+ and so on. Because the charge increases while ' +
      'the mass stays the same, each successive species appears at a lower m/z.'
    ] },
    { p: [
      'An analyst uses this pattern to calculate the molecular mass, a step called ' +
      'deconvolution. A series of related peaks is therefore expected in a peptide spectrum ' +
      'and is not in itself evidence of multiple compounds.'
    ] },

    { h3: 'Monoisotopic and average mass' },
    { p: [
      'Certificates sometimes report two expected masses. The monoisotopic mass is ' +
      'calculated using the most abundant isotope of each element. The average mass uses the ' +
      'natural isotopic mixture, and is slightly higher. Which one applies depends on the ' +
      'resolution of the instrument, so a small difference between an expected and observed ' +
      'figure may simply reflect which convention was used.'
    ] },

    { h2: 'What a mass match shows' },
    { p: [
      'When the observed mass agrees with the mass calculated from the molecular formula of ' +
      'the named compound, within the tolerance of the instrument, the result is reported as ' +
      'conforming or consistent with the expected structure.'
    ] },
    { p: [
      'The precise claim is narrow and worth stating plainly: a species was detected whose ' +
      'mass matches the mass the named compound should have. That is meaningful evidence ' +
      'about identity, and it is the whole of what the measurement provides.'
    ] },

    { h3: 'How close is close enough' },
    { p: [
      'Observed and expected masses rarely agree to every decimal place, so a result is ' +
      'assessed against a tolerance. High-resolution instruments express this in parts per ' +
      'million, where the allowed difference scales with the mass being measured. Lower ' +
      'resolution instruments are usually assessed against an absolute window in daltons.'
    ] },
    { p: [
      'A certificate that states the tolerance alongside the two figures is giving you what ' +
      'you need to judge the match yourself. Where no tolerance is stated, the conclusion ' +
      'line records the judgement of the analyst rather than a figure you can check.'
    ] },

    { h2: 'What a mass match does not show' },
    { ul: [
      [
        'Mass alone does not distinguish molecules that share a formula. Sequence isomers, ' +
        'built from the same residues in a different order, have the same mass.'
      ],
      [
        'A mass measurement does not describe proportion. Detecting the expected species ' +
        'says nothing about what share of the material in the vial it represents, which is ' +
        'what ',
        { href: '/blog/what-hplc-testing-measures', text: 'HPLC' },
        ' is used to estimate.'
      ],
      [
        'Ionisation efficiency varies between compounds, so peak intensity in a spectrum is ' +
        'not a reliable measure of relative amount.'
      ]
    ] },
    { note: [
      'Identity and purity are separate measurements that fail independently. ',
      { href: '/blog/peptide-purity-vs-identity-testing', text: 'Purity and identity testing' },
      ' covers why a certificate reports both, and why neither substitutes for the other.'
    ] },

    { h3: 'Where sequence information comes from' },
    { p: [
      'Tandem mass spectrometry, written as MS/MS, addresses part of the isomer limitation. ' +
      'Ions of a selected mass are fragmented and the fragments are measured, and the ' +
      'pattern of fragment masses carries information about the order of residues. It is a ' +
      'separate analysis and appears on a certificate only when it was performed.'
    ] },

    { h2: 'Reading a mass spectrometry section' },
    { ol: [
      ['Which ionisation method is named, and which analyser?'],
      ['Is the expected mass monoisotopic or average?'],
      ['What is the difference between expected and observed, and is a tolerance stated?'],
      ['Is a spectrum included, so the reported figure can be checked against it?'],
      ['Was the measurement made on the same batch as the rest of the certificate?']
    ] },
    { p: [
      { href: '/blog/how-to-read-a-certificate-of-analysis', text: 'How to read a certificate of analysis' },
      ' covers the document as a whole, and published certificates for compounds in our ' +
      'catalogue are on the ',
      { href: '/coas.html', text: 'certificates of analysis page' },
      '.'
    ] },
    { note: [
      'All compounds and research materials supplied by PepX Research are for laboratory and ' +
      'research use only. They are not for human consumption.'
    ] }
  ]
};
