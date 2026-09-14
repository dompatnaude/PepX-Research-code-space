'use strict';

// Lyophilisation. Describes the process and what the word on a label does and
// does not indicate. Deliberately contains no reconstitution, handling or
// preparation instructions of any kind.

module.exports = {
  slug: 'what-does-lyophilized-mean',
  title: 'What Does Lyophilized Mean?',
  metaTitle: 'What Does Lyophilized Mean? | PepX Research',
  metaDescription:
    'Lyophilization is freeze-drying: water is removed by sublimation under vacuum. ' +
    'What the process involves and what the term on a label does not indicate.',
  excerpt:
    'Lyophilization is freeze-drying, a process that removes water by sublimation ' +
    'under vacuum. What the three stages involve, and what the word on a label tells you.',
  category: 'Laboratory Terminology',
  datePublished: '2026-09-14',
  status: 'published',
  body: [
    { p: [
      'Lyophilized, also spelled lyophilised and more plainly called freeze-dried, describes ' +
      'material that has had its water removed by sublimation under vacuum rather than by ' +
      'evaporation. The word appears on peptide labels and certificates often enough to be ' +
      'worth understanding precisely, because it describes a process rather than a quality ' +
      'grade.'
    ] },

    { h2: 'Sublimation, and why it is used' },
    { p: [
      'Sublimation is the transition of a solid directly to a vapour without passing through ' +
      'a liquid phase. Water can be made to do this by holding it below its triple point: ' +
      'frozen, and at low enough pressure that ice turns to vapour instead of melting.'
    ] },
    { p: [
      'The reason to remove water this way rather than by heating is that the material stays ' +
      'frozen throughout. Many peptides and proteins are sensitive to heat and to processes ' +
      'that concentrate them in solution. Freeze-drying avoids both, which is why it is the ' +
      'standard approach for materials that would not survive conventional drying intact.'
    ] },

    { h2: 'The three stages' },
    { h3: 'Freezing' },
    { p: [
      'The solution is cooled until it is fully solid. How quickly this is done affects the ' +
      'size of the ice crystals that form, which in turn affects the structure of the dried ' +
      'material and how readily it dissolves later. Freezing is a controlled step, not ' +
      'merely a preliminary one.'
    ] },
    { h3: 'Primary drying' },
    { p: [
      'Pressure is lowered and a small amount of heat is supplied, enough to drive ' +
      'sublimation without melting the frozen material. The ice sublimes and the vapour is ' +
      'captured on a cold condenser. This stage removes the bulk of the water and is usually ' +
      'the longest part of the drying cycle.'
    ] },
    { h3: 'Secondary drying' },
    { p: [
      'Once the ice is gone, some water remains bound to the material itself. The ' +
      'temperature is raised further to drive this off by desorption. The endpoint is a ' +
      'target residual moisture level rather than complete dryness, because a small amount ' +
      'of water almost always remains.'
    ] },

    { h2: 'What the result looks like' },
    { p: [
      'Freeze-dried material typically forms a solid, porous cake that holds the shape of ' +
      'the vessel it was dried in, or a light powder. The porosity is a consequence of the ' +
      'ice crystals that sublimed away, leaving voids behind.'
    ] },
    { p: [
      'Appearance varies. A cake may be intact, partly collapsed, or present as loose ' +
      'powder, and it may sit as a film on the wall of the vial rather than at the bottom. ' +
      'These are observations about physical form. Certificates that record appearance are ' +
      'describing the material as received, which is why the observation is reported ' +
      'separately from the analytical results.'
    ] },

    { h3: 'What cake collapse indicates' },
    { p: [
      'A cake that has lost its structure and slumped is described as collapsed. It happens ' +
      'when material warms past the temperature at which the frozen matrix can hold its ' +
      'shape during drying, so the pore structure gives way before the water has gone.'
    ] },
    { p: [
      'Collapse is a process observation rather than a result. It can leave more residual ' +
      'water behind and it can slow redissolution, but whether either occurred in a given ' +
      'batch is answered by the measurements reported for that batch, not by the appearance ' +
      'of the cake.'
    ] },

    { h2: 'Residual moisture' },
    { p: [
      'Because secondary drying targets a level rather than zero, residual moisture is a ' +
      'measured property. It is usually determined by Karl Fischer titration and reported as ' +
      'a percentage by weight.'
    ] },
    { p: [
      'The figure matters for two reasons. Water participates in several degradation ' +
      'pathways, so residual moisture is relevant to how well material holds up in storage. ' +
      'It also forms part of the mass in the vial that is not compound, alongside salts and ' +
      'counterions from synthesis, which is why chromatographic purity and the share of vial ' +
      'mass that is peptide are ',
      { href: '/blog/peptide-purity-vs-identity-testing', text: 'two different measurements' },
      '.'
    ] },

    { h2: 'What the term does and does not indicate' },
    { p: [
      'Lyophilized describes how water was removed. It is a processing description, and on ' +
      'its own it carries no information about the other properties of the material.'
    ] },
    { ul: [
      ['It does not indicate purity, which is measured chromatographically.'],
      ['It does not indicate identity, which is measured by mass.'],
      ['It does not indicate that any particular residual moisture level was achieved, unless a figure is reported.'],
      ['It does not indicate anything about suitability for any use.']
    ] },
    { note: [
      'The word on a label describes a manufacturing step. Any statement about the ' +
      'composition of a specific batch comes from the analytical results reported for that ' +
      'batch, not from the processing description.'
    ] },

    { h2: 'Where it appears on documentation' },
    { p: [
      'Lyophilized material is normally identified as such in the description or appearance ' +
      'section of a certificate of analysis, often alongside a residual moisture figure and ' +
      'a note on whether the material dissolved as expected in a stated laboratory solvent. ',
      { href: '/blog/how-to-read-a-certificate-of-analysis', text: 'How to read a certificate of analysis' },
      ' covers how those sections fit together, and published certificates for compounds in ' +
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
