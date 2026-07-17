import type {
  CellStatus,
  NodeRef,
  OrgChart,
  OrgNode,
  Requirement,
  RiskItem,
  TableCell,
  XYSeries,
} from './model'
import { uid } from './model'

/*
 * Starter templates modeled on the org-chart patterns used in Astrion
 * proposals. Each returns a fresh chart with new ids so several instances
 * can coexist.
 */

function node(partial: Partial<OrgNode> & { title: string }): OrgNode {
  return { id: uid(), variant: 'secondary', childLayout: 'row', ...partial }
}

/** Build a compliance-register requirement with a fresh id. */
function req(kind: Requirement['kind'], ref: string, title?: string): Requirement {
  return title ? { id: uid('req'), kind, ref, title } : { id: uid('req'), kind, ref }
}

/** Template 1 — program office with stacked capability lists + corner markers. */
function programOffice(): OrgChart {
  const cap = (title: string): OrgNode =>
    node({ title, variant: 'tertiary', badges: ['cornerAccent'] })

  const divisions: OrgNode[] = [
    node({
      title: 'Advanced Manufacturing',
      childLayout: 'stack',
      children: [
        cap('Precision Cleaning'),
        cap('Electrical / Mechanical Assembly'),
        cap('Planning, Estimating & Logistics'),
        cap('Fabrication'),
      ],
    }),
    node({ title: 'Environmental Gas Laboratory' }),
    node({
      title: 'Fluid & Structural and Strength Dynamics',
      childLayout: 'stack',
      children: [cap('Fluid Dynamics'), cap('Structural & Strength Dynamics')],
    }),
    node({
      title: 'Propulsion Test',
      childLayout: 'stack',
      children: [
        cap('Mechanical'),
        cap('Trades'),
        cap('Controls / Instrumentation, Data Acquisition'),
      ],
    }),
    node({
      title: 'Pressurant Propellants & Valve Laboratory',
      childLayout: 'stack',
      children: [
        cap('Valve and Component Laboratory'),
        cap('Pressurant & Propellant Delivery Systems'),
      ],
    }),
    node({ title: 'Metrology & Calibration Laboratory' }),
  ]

  return {
    version: 1,
    meta: { title: 'Program Organization', showTitle: true },
    roots: [
      node({
        title: 'Office of Program Manager',
        variant: 'primary',
        width: 260,
        children: [
          node({
            title: 'Safety, Health, Environmental, & Quality',
            variant: 'primary',
            width: 230,
            childLayout: 'stack',
            children: [cap('NDE Laboratory')],
          }),
          ...divisions,
          node({ title: 'Program Business Office', variant: 'primary', width: 220 }),
        ],
      }),
    ],
    groups: [],
    comms: [],
    legend: [{ id: uid('l'), marker: 'cornerAccent', label: 'Similar Technical Support Areas' }],
  }
}

/** Template 2 — director level with PWS / Deliverables / Interface rows, key
 *  badges, a Mission Focus zone, and a worked compliance example: structured
 *  references on each leader plus a requirements register, with the on-chart
 *  compliance overlay enabled so it demonstrates coverage + gaps on first load. */
function directorLevel(): OrgChart {
  const pws = (...refs: string[]): NodeRef[] => refs.map((ref) => ({ kind: 'PWS' as const, ref }))
  const cdrl = (...refs: string[]): NodeRef[] => refs.map((ref) => ({ kind: 'CDRL' as const, ref }))

  const missionDirectors: OrgNode[] = [
    node({
      title: 'Modernization Director',
      badges: ['keyGray'],
      width: 210,
      bullets: ['Capital Improvement', 'Infrastructure Improvement', 'Surge Project Support'],
      refs: pws('3.8'),
      details: [
        { label: 'PWS:', text: '3.8' },
        { label: 'Deliverables:', text: 'A047-A049, A051-A054' },
        { label: 'Interface:', text: 'Customer TSDC' },
      ],
    }),
    node({
      title: 'Test Operations Director',
      badges: ['keyGray'],
      width: 230,
      bullets: ['Turbine Engine', 'Wind Tunnel & Aerodynamics', 'Space & Missile', 'Hypersonics'],
      refs: [...pws('3.1', '3.2', '3.3', '3.21'), ...cdrl('A003')],
      details: [
        { label: 'PWS:', text: '3.1-3.3, 3.19.23, 3.19.24, 3.21' },
        { label: 'Deliverables:', text: 'A003-A007, A010, A021' },
        { label: 'Interface:', text: '704th TG; 804th TG; TSD' },
      ],
    }),
    node({
      title: 'Engineering & Technical Support Director',
      badges: ['keyGray'],
      width: 240,
      bullets: ['ID&C', 'TMDE', 'Digital Modernization', 'Test Technology / Design Engineering'],
      refs: pws('3.6', '3.7', '3.10'),
      details: [
        { label: 'PWS:', text: '3.1.9-3.1.12, 3.3.3, 3.6, 3.7, 3.10' },
        { label: 'Deliverables:', text: 'A009, A022, A027, A032-A046' },
        { label: 'Interface:', text: 'Customer TSDI' },
      ],
    }),
    node({
      title: 'Asset Management Director',
      badges: ['keyGray'],
      width: 220,
      bullets: ['Predictive Maintenance', 'Plant / Test Cell Support', 'Utilities / Base Support'],
      refs: [...pws('3.5', '3.9', '3.11'), ...cdrl('A050')],
      details: [
        { label: 'PWS:', text: '3.3.11, 3.5, 3.9, 3.11-3.13' },
        { label: 'Deliverables:', text: 'A018, A022-A031, A050' },
        { label: 'Interface:', text: 'Customer TSDC' },
      ],
    }),
  ]

  const dgm = node({
    title: 'Deputy General Manager / Program Integration Office',
    variant: 'primary',
    name: 'Deputy GM Name',
    photo: true,
    badges: ['keyGold'],
    width: 330,
    refs: pws('3.4', '3.20'),
    details: [
      { label: 'PWS:', text: '3.4, 3.18.1, 3.18.4, 3.18.5, 3.20' },
      { label: 'Deliverables:', text: 'A008, A019-A021, A109, A113' },
      { label: 'Interface:', text: 'Customer CV; Customer PM' },
    ],
    children: [
      node({
        title: 'Business Director',
        badges: ['keyGray'],
        width: 210,
        bullets: ['Finance; Business Systems', 'Logistics; Procurement', 'Public Affairs'],
        refs: pws('2.2', '2.3', '3.15'),
        details: [
          { label: 'PWS:', text: '2.2, 2.3, 3.3.8, 3.15-3.17' },
          { label: 'Deliverables:', text: 'A076-A087, A115-A116' },
        ],
      }),
      ...missionDirectors,
      node({
        title: 'Talent Management Director',
        badges: ['keyGray'],
        width: 200,
        bullets: ['Hiring / Recruiting; HR', 'Labor Relations; Training'],
        refs: pws('2.4'),
        details: [
          { label: 'PWS:', text: '2.4, 3.19.4' },
          { label: 'Deliverables:', text: 'A001-A002, A092' },
        ],
      }),
    ],
  })

  // Authoritative register. Most paragraphs have an owner above; a handful are
  // intentionally unowned so the overlay shows real coverage gaps.
  const requirements: Requirement[] = [
    req('PWS', '2.1', 'Program management'),
    req('PWS', '2.2', 'Business systems & finance'),
    req('PWS', '2.3', 'Logistics & procurement'),
    req('PWS', '2.4', 'Talent management'),
    req('PWS', '3.1', 'Turbine engine test'),
    req('PWS', '3.2', 'Wind tunnel & aerodynamics test'),
    req('PWS', '3.3', 'Space & missile test'),
    req('PWS', '3.4', 'Program integration'),
    req('PWS', '3.5', 'Plant & test-cell maintenance'),
    req('PWS', '3.6', 'Instrumentation, data & control'),
    req('PWS', '3.7', 'Test technology & design engineering'),
    req('PWS', '3.8', 'Modernization & capital improvement'),
    req('PWS', '3.9', 'Predictive maintenance'),
    req('PWS', '3.10', 'Digital modernization'),
    req('PWS', '3.11', 'Utilities & base support'),
    req('PWS', '3.12', 'Base civil engineering support'),
    req('PWS', '3.13', 'Energy & utilities management'),
    req('PWS', '3.14', 'Quality management'),
    req('PWS', '3.15', 'Public affairs'),
    req('PWS', '3.16', 'Property & asset accountability'),
    req('PWS', '3.20', 'Configuration & data management'),
    req('PWS', '3.21', 'Hypersonics test'),
    req('PWS', '3.24', 'Safety & health'),
    req('PWS', '3.25', 'Environmental compliance'),
    req('CDRL', 'A003', 'Monthly test report'),
    req('CDRL', 'A050', 'Facilities condition report'),
    req('CDRL', 'A999', 'Annual staffing plan'),
  ]

  const chart: OrgChart = {
    version: 1,
    meta: { title: 'Program Leadership Organization', showTitle: true, showComplianceOverlay: true },
    roots: [
      node({
        title: 'General Manager',
        variant: 'primary',
        name: 'GM Name',
        photo: true,
        badges: ['keyGold'],
        width: 250,
        refs: pws('2.1'),
        details: [
          { label: 'PWS:', text: '2.1' },
          { label: 'Interface:', text: 'Customer CO, COR, CC' },
        ],
        children: [
          node({
            title: 'Safety & Mission Assurance Director',
            variant: 'primary',
            badges: ['keyGold'],
            width: 250,
            bullets: ['Mission Assurance / Performance Mgmt', 'Health, Safety, Environmental', 'Quality'],
            refs: pws('3.14', '3.24', '3.25'),
            details: [
              { label: 'PWS:', text: '3.14, 3.18.6, 3.19.1, 3.24, 3.25' },
              { label: 'Interface:', text: 'Customer SE' },
            ],
          }),
          dgm,
        ],
      }),
    ],
    groups: [
      {
        id: uid('g'),
        label: 'Mission Focus',
        style: 'green',
        memberIds: missionDirectors.map((d) => d.id),
      },
    ],
    comms: [],
    legend: [
      { id: uid('l'), marker: 'keyGold', label: 'RFP Required' },
      { id: uid('l'), marker: 'keyGray', label: 'Company Designated' },
      { id: uid('l'), marker: 'green', label: 'Mission Focus' },
    ],
    compliance: { requirements },
  }
  return chart
}

/** Template 3 — PMO with corporate/customer columns and communication channels. */
function pmoComms(): OrgChart {
  const corp: OrgNode[] = [
    node({ title: 'Executive Management Council', variant: 'accent', width: 210 }),
    node({ title: 'Transition Team', width: 210 }),
    node({ title: 'Quality / Risk Manager', name: 'Manager Name', width: 210 }),
    node({ title: 'Human Resources', width: 210 }),
    node({ title: 'Resource Allocation Board', variant: 'accent', width: 210 }),
    node({ title: 'Corporate Support Hub', width: 210 }),
  ]
  const customer: OrgNode[] = [
    node({ title: 'Customer & PMO Leadership', variant: 'tertiary', width: 200 }),
    node({ title: 'CO / COR / PM', variant: 'tertiary', width: 200 }),
    node({ title: 'Managers', variant: 'tertiary', width: 200 }),
    node({ title: 'Task Leads', variant: 'tertiary', width: 200 }),
  ]

  const taskLeads = [
    node({ title: 'TO 1 Task Lead', variant: 'primary', width: 130 }),
    node({ title: 'TO 2 Task Lead', variant: 'accent', width: 130 }),
    node({ title: 'TO 3 Task Lead', variant: 'primary', width: 130 }),
    node({ title: 'TO n Task Lead', variant: 'accent', width: 130 }),
  ]

  const contractsDir = node({
    title: 'Contracts Director',
    name: 'Director Name',
    width: 210,
    children: [node({ title: 'Subcontracts Manager', name: 'Manager Name', width: 210 })],
  })
  const ociMgr = node({
    title: 'OCI Manager',
    name: 'Manager Name',
    width: 200,
    children: [node({ title: 'Financial Manager', name: 'Manager Name', width: 200 })],
  })
  const itomt = node({
    title: 'Integrated Task Order Management Team',
    width: 300,
    children: [
      node({
        title: 'Task Order Manager',
        name: 'Manager Name',
        width: 300,
        children: [
          node({
            title: 'Functional Task Area Leads (20)',
            width: 300,
            children: taskLeads,
          }),
        ],
      }),
    ],
  })

  const dpm = node({
    title: 'Deputy Program Manager',
    variant: 'primary',
    name: 'Deputy PM Name',
    width: 300,
    children: [ociMgr, contractsDir, itomt],
  })
  const cpm = node({
    title: 'Contract Program Manager',
    variant: 'primary',
    name: 'PM Name',
    width: 300,
    children: [dpm],
  })
  const gm = node({
    title: 'Civilian Division, EVP & GM',
    variant: 'primary',
    name: 'GM Name',
    width: 300,
    children: [cpm],
  })
  const ceo = node({
    title: 'Astrion CEO',
    variant: 'primary',
    name: 'CEO Name',
    width: 300,
    children: [gm],
  })

  const chart: OrgChart = {
    version: 1,
    meta: { title: 'PMO & Lines of Communication', showTitle: true },
    roots: [
      node({ title: 'Corporate Resources', variant: 'hidden', childLayout: 'stack', children: corp }),
      ceo,
      node({ title: 'Customer', variant: 'hidden', childLayout: 'stack', children: customer }),
    ],
    groups: [
      {
        id: uid('g'),
        label: 'PMO',
        style: 'dashed',
        memberIds: [cpm.id],
      },
    ],
    comms: [
      { id: uid('c'), fromId: corp[0].id, toId: cpm.id, twoWay: true },
      { id: uid('c'), fromId: corp[4].id, toId: itomt.id, twoWay: true },
      { id: uid('c'), fromId: cpm.id, toId: customer[1].id, twoWay: true },
      { id: uid('c'), fromId: dpm.id, toId: customer[2].id, twoWay: true },
      { id: uid('c'), fromId: itomt.id, toId: customer[3].id, twoWay: true },
    ],
    legend: [
      { id: uid('l'), marker: 'boxSecondary', label: 'Corporate Resources' },
      { id: uid('l'), marker: 'boxAccent', label: 'Subcontractor Participation' },
      { id: uid('l'), marker: 'dashed', label: 'PMO' },
      { id: uid('l'), marker: 'comm', label: 'Communication Channels' },
    ],
  }
  return chart
}

/** Template 4 — a clean, generic top-down hierarchy. A good neutral starting
 *  point when a proposal-specific pattern isn't needed yet. */
function simpleHierarchy(): OrgChart {
  const team = (title: string): OrgNode => node({ title, variant: 'tertiary', width: 155 })
  return {
    version: 1,
    meta: { title: 'Organization Chart', showTitle: true },
    roots: [
      node({
        title: 'Chief Executive Officer',
        variant: 'primary',
        name: 'Name',
        width: 210,
        children: [
          node({
            title: 'Chief Operating Officer',
            name: 'Name',
            width: 185,
            children: [team('Operations'), team('Logistics')],
          }),
          node({
            title: 'Chief Financial Officer',
            name: 'Name',
            width: 185,
            children: [team('Accounting'), team('Finance')],
          }),
          node({
            title: 'Chief Technology Officer',
            name: 'Name',
            width: 185,
            children: [team('Engineering'), team('IT & Security')],
          }),
        ],
      }),
    ],
    groups: [],
    comms: [],
    legend: [],
  }
}

/** Template 5 — functional organization: an executive over departments, each
 *  carrying a stacked list of sub-functions. */
function functionalDivisions(): OrgChart {
  const sub = (title: string): OrgNode => node({ title, variant: 'tertiary', width: 178 })
  const dept = (title: string, subs: string[]): OrgNode =>
    node({ title, variant: 'secondary', width: 188, childLayout: 'stack', children: subs.map(sub) })

  return {
    version: 1,
    meta: { title: 'Functional Organization', showTitle: true },
    roots: [
      node({
        title: 'Executive Director',
        variant: 'primary',
        width: 220,
        children: [
          dept('Operations', ['Field Operations', 'Scheduling', 'Quality Control']),
          dept('Engineering', ['Design', 'Test & Evaluation', 'Systems']),
          dept('Business & Finance', ['Accounting', 'Contracts', 'Procurement']),
          dept('People & Culture', ['Recruiting', 'HR', 'Training']),
          dept('Information Technology', ['Infrastructure', 'Cybersecurity', 'Support']),
        ],
      }),
    ],
    groups: [],
    comms: [],
    legend: [],
  }
}

/** Template 6 — joint-venture management: a customer / government column on the
 *  left, a board → GM → managers → technical-manager branch chain in the center,
 *  a JV PMO service stack on the right, and lines of communication between them. */
function jointVenture(): OrgChart {
  // Left: customer / government stakeholders plus the labs they oversee.
  const customer: OrgNode[] = [
    node({ title: 'Customer CO, COR, Alt. COR', variant: 'primary', width: 210 }),
    node({ title: 'Customer Engineering Director', variant: 'primary', width: 210 }),
    node({ title: 'Customer Business Manager', variant: 'primary', width: 210 }),
    node({ title: 'Customer Branch Managers', variant: 'primary', width: 210 }),
    node({ title: 'Laboratory / Facility A', variant: 'secondary', width: 210 }),
    node({ title: 'Laboratory / Facility B', variant: 'secondary', width: 210 }),
    node({ title: 'Laboratory / Facility C', variant: 'secondary', width: 210 }),
  ]

  // Center: JV management chain.
  const businessMgr = node({ title: 'Business Manager', name: 'Name', width: 190 })
  const qcMgr = node({ title: 'QC / SHE Manager', name: 'Name', width: 190 })
  const tm1 = node({
    title: 'TM (Branch)',
    variant: 'tertiary',
    width: 150,
    childLayout: 'stack',
    children: [
      node({ title: 'Prime', variant: 'secondary', width: 120 }),
      node({ title: 'Sub A', variant: 'secondary', width: 120 }),
    ],
  })
  const tm2 = node({
    title: 'TM (Branch)',
    variant: 'tertiary',
    width: 150,
    childLayout: 'stack',
    children: [
      node({ title: 'Sub B', variant: 'secondary', width: 120 }),
      node({ title: 'Sub C', variant: 'secondary', width: 120 }),
    ],
  })
  const tm3 = node({
    title: 'TM (Branch)',
    variant: 'tertiary',
    width: 150,
    childLayout: 'stack',
    children: [node({ title: 'Sub D', variant: 'secondary', width: 120 })],
  })
  const tmLead = node({
    title: 'Technical Managers (TMs)',
    variant: 'secondary',
    width: 200,
    children: [tm1, tm2, tm3],
  })
  const gm = node({
    title: 'JV General Manager',
    variant: 'primary',
    name: 'Name',
    width: 210,
    children: [businessMgr, tmLead, qcMgr],
  })
  const board = node({
    title: 'JV Board',
    variant: 'primary',
    name: 'Board Chair',
    width: 210,
    children: [gm],
  })

  // Right: JV PMO service stack + subcontractor PMOs.
  const pmo = node({
    title: 'JV PMO',
    variant: 'primary',
    width: 220,
    bullets: [
      'PMO Lead',
      'Finance / Accounting',
      'Human Resources',
      'Program Control',
      'Security (FSO)',
      'Contracts',
      'Subcontractor Mgmt',
      'Quality / SHE',
      'IT Systems',
    ],
  })
  const subPmo = node({
    title: 'Subcontractor PMOs',
    variant: 'secondary',
    width: 220,
    bullets: ['Subcontractor A', 'Subcontractor B', 'Subcontractor C', 'Subcontractor D'],
  })

  return {
    version: 1,
    meta: { title: 'Joint Venture Management Organization', showTitle: true },
    roots: [
      node({ title: 'Customer', variant: 'hidden', childLayout: 'stack', children: customer }),
      board,
      node({ title: 'PMO', variant: 'hidden', childLayout: 'stack', children: [pmo, subPmo] }),
    ],
    groups: [
      { id: uid('g'), label: 'Technical Managers (TMs)', style: 'blue', memberIds: [tmLead.id] },
    ],
    comms: [
      { id: uid('c'), fromId: customer[0].id, toId: board.id, twoWay: true },
      { id: uid('c'), fromId: customer[1].id, toId: gm.id, twoWay: true },
      { id: uid('c'), fromId: customer[2].id, toId: businessMgr.id, twoWay: true },
      { id: uid('c'), fromId: gm.id, toId: pmo.id, twoWay: true },
      { id: uid('c'), fromId: businessMgr.id, toId: pmo.id, twoWay: true },
    ],
    legend: [
      { id: uid('l'), marker: 'boxPrimary', label: 'External / customer & JV leadership' },
      { id: uid('l'), marker: 'boxSecondary', label: 'Internal / JV & subcontractors' },
      { id: uid('l'), marker: 'blue', label: 'Government management & communication' },
      { id: uid('l'), marker: 'comm', label: 'Lines of communication' },
    ],
  }
}

/** Template 7 — mentor-protégé joint venture across multiple sites: a
 *  government-operational column, a gold program-leadership chain, delivery-staff
 *  functional leads, and a corporate-resources column. */
function mentorProtege(): OrgChart {
  // Left: government operational chain.
  const government: OrgNode[] = [
    node({ title: 'Government PM | KO | COR', variant: 'tertiary', width: 210 }),
    node({ title: 'Operational Unit — HQ', variant: 'tertiary', width: 210 }),
    node({ title: 'Operational Unit — Det. 1', variant: 'tertiary', width: 210 }),
    node({ title: 'Operational Unit — Det. 2', variant: 'tertiary', width: 210 }),
  ]

  // Center: program leadership team (gold) with delivery-staff functional leads.
  const funcHq = node({ title: 'Functional Leads — JV / Subcontractor Staff', variant: 'secondary', width: 210 })
  const funcDet1 = node({ title: 'Functional Leads — JV / Subcontractor Staff', variant: 'secondary', width: 210 })
  const funcDet2 = node({ title: 'Functional Leads — JV / Subcontractor Staff', variant: 'secondary', width: 210 })

  const seniorPm1 = node({
    title: 'Senior Program Manager / Site Supervisor',
    name: 'Det. 1',
    variant: 'accent',
    width: 210,
    children: [funcDet1],
  })
  const seniorPm2 = node({
    title: 'Senior Program Manager / Site Supervisor',
    name: 'Det. 2',
    variant: 'accent',
    width: 210,
    children: [funcDet2],
  })
  const pm = node({
    title: 'SME Program Manager / Site Supervisor',
    name: 'HQ',
    variant: 'accent',
    width: 220,
    children: [funcHq, seniorPm1, seniorPm2],
  })
  const mpjv = node({
    title: 'Mentor-Protégé Joint Venture',
    name: 'Mentor CEO | Protégé CEO',
    variant: 'accent',
    width: 240,
    children: [pm],
  })

  // Right: executive council + corporate resources.
  const council = node({
    title: 'Executive Management Council',
    variant: 'primary',
    width: 220,
    bullets: ['Mentor', 'Protégé'],
  })
  const corp = node({
    title: 'Corporate Resources',
    variant: 'primary',
    width: 220,
    bullets: ['Human Resources', 'Recruiting', 'Finance', 'Procurement', 'Quality', 'Security'],
  })

  return {
    version: 1,
    meta: { title: 'Mentor-Protégé Joint Venture Organization', showTitle: true },
    roots: [
      node({ title: 'Government', variant: 'hidden', childLayout: 'stack', children: government }),
      mpjv,
      node({ title: 'Corporate', variant: 'hidden', childLayout: 'stack', children: [council, corp] }),
    ],
    groups: [],
    comms: [
      { id: uid('c'), fromId: government[0].id, toId: mpjv.id, twoWay: true },
      { id: uid('c'), fromId: government[1].id, toId: pm.id, twoWay: true },
      { id: uid('c'), fromId: government[2].id, toId: seniorPm1.id, twoWay: true },
      { id: uid('c'), fromId: government[3].id, toId: seniorPm2.id, twoWay: true },
      { id: uid('c'), fromId: council.id, toId: mpjv.id, twoWay: true },
    ],
    legend: [
      { id: uid('l'), marker: 'boxAccent', label: 'Program Leadership Team' },
      { id: uid('l'), marker: 'boxSecondary', label: 'JV / Subcontractor Delivery Staff' },
      { id: uid('l'), marker: 'boxTertiary', label: 'Government (Operational)' },
      { id: uid('l'), marker: 'boxPrimary', label: 'JV / Corporate Resources' },
      { id: uid('l'), marker: 'comm', label: 'Communication' },
    ],
  }
}

/** Template 8 — a program Work Breakdown Structure. A clean tree; the WBS
 *  outline numbers (1, 1.1, 1.1.1 ...) are added by the WBS-numbers view, which
 *  this template turns on, so numbering stays automatic as elements are added. */
function wbs(): OrgChart {
  const leaf = (title: string): OrgNode => node({ title, variant: 'tertiary', width: 172 })
  const elem = (title: string, children: OrgNode[]): OrgNode =>
    node({ title, variant: 'secondary', width: 190, children })
  return {
    version: 1,
    meta: { title: 'Program Work Breakdown Structure', showTitle: true, showWbsNumbers: true },
    roots: [
      node({
        title: 'Program',
        variant: 'primary',
        width: 200,
        children: [
          elem('Program Management', [leaf('Planning & Control'), leaf('Risk & Quality')]),
          elem('Systems Engineering', [leaf('Requirements'), leaf('Architecture'), leaf('Verification & Validation')]),
          elem('Software Development', [leaf('Design'), leaf('Implementation'), leaf('Integration')]),
          elem('Test & Evaluation', [leaf('Test Planning'), leaf('Execution & Reporting')]),
          elem('Logistics & Sustainment', [leaf('Training'), leaf('Maintenance')]),
        ],
      }),
    ],
    groups: [],
    comms: [],
    legend: [],
  }
}

/** Template 9 — teaming / workshare: the prime over its subcontractors, each
 *  box carrying its role and workshare %. Color separates prime, large subs,
 *  and small businesses; the legend explains the coding. */
function teaming(): OrgChart {
  const sub = (title: string, role: string, workshare: string, category: string): OrgNode =>
    node({
      title,
      variant: category === 'Large Business' ? 'secondary' : 'accent',
      width: 200,
      details: [
        { label: 'Role:', text: role },
        { label: 'Workshare:', text: workshare },
        { label: 'Category:', text: category },
      ],
    })

  const prime = node({
    title: 'Astrion (Prime)',
    variant: 'primary',
    name: 'Prime Contractor',
    width: 240,
    details: [
      { label: 'Role:', text: 'Prime / Systems Integration' },
      { label: 'Workshare:', text: '55%' },
      { label: 'Category:', text: 'Large Business' },
    ],
    children: [
      sub('Subcontractor A', 'Software & Data', '20%', 'Large Business'),
      sub('Subcontractor B', 'Cyber & SIGINT', '12%', 'SDVOSB'),
      sub('Subcontractor C', 'Logistics & Training', '8%', 'WOSB'),
      sub('Subcontractor D', 'Specialty Engineering', '5%', 'HUBZone'),
    ],
  })

  return {
    version: 1,
    meta: { title: 'Teaming & Workshare', showTitle: true },
    roots: [prime],
    groups: [],
    comms: [],
    legend: [
      { id: uid('l'), marker: 'boxPrimary', label: 'Prime' },
      { id: uid('l'), marker: 'boxSecondary', label: 'Subcontractor (other-than-small)' },
      { id: uid('l'), marker: 'boxAccent', label: 'Small business' },
    ],
  }
}

/** Template 10 — a 90-day transition / phase-in schedule for the timeline
 *  layout. Tasks carry start + duration in days; milestones render as diamonds;
 *  30/60/90-day gates are phase markers. */
function transitionSchedule(): OrgChart {
  const task = (
    title: string,
    start: number,
    duration: number,
    variant: OrgNode['variant'] = 'secondary',
    children?: OrgNode[],
  ): OrgNode => node({ title, variant, start, duration, ...(children ? { children } : {}) })
  const ms = (title: string, at: number): OrgNode =>
    node({ title, variant: 'accent', start: at, milestone: true })

  const mobilization = task('Mobilization', 0, 30, 'primary', [
    task('Key Personnel Onboarding', 0, 20, 'tertiary'),
    task('Facilities & IT Setup', 5, 25, 'tertiary'),
    task('Security Clearances', 0, 45, 'tertiary'),
  ])
  const knowledge = task('Knowledge Transfer', 10, 45, 'primary', [
    task('Incumbent Shadowing', 10, 25, 'tertiary'),
    task('Process Documentation', 20, 30, 'tertiary'),
  ])
  const cutover = task('Systems Cutover', 45, 25, 'primary')
  const steady = task('Steady-State Operations', 90, 30, 'secondary')

  return {
    version: 1,
    meta: {
      title: '90-Day Transition & Phase-In',
      showTitle: true,
      layout: 'timeline',
      caption:
        'A phased 90-day transition retires risk early: key personnel and clearances land first, knowledge transfer overlaps incumbent operations, and systems cut over before full operational capability at day 90.',
    },
    schedule: {
      unit: 'day',
      span: 120,
      phases: [
        { label: '30-Day', at: 30 },
        { label: '60-Day', at: 60 },
        { label: 'FOC (90)', at: 90 },
      ],
    },
    roots: [
      ms('Contract Award', 0),
      mobilization,
      knowledge,
      cutover,
      ms('Full Operational Capability', 90),
      steady,
    ],
    groups: [
      { id: uid('g'), label: 'Stand-up', style: 'green', memberIds: [mobilization.id] },
      { id: uid('g'), label: 'Transition', style: 'blue', memberIds: [knowledge.id, cutover.id] },
      { id: uid('g'), label: 'Operations', style: 'orange', memberIds: [steady.id] },
    ],
    comms: [],
    legend: [],
  }
}

/** A hidden placeholder root so data charts (table / risk cube / xy) satisfy
 *  the non-empty roots invariant; those layouts ignore roots entirely. */
function placeholderRoots(): OrgNode[] {
  return [node({ title: '', variant: 'hidden' })]
}

const cell = (text: string, status?: CellStatus): TableCell => (status ? { text, status } : { text })

/** Template 11 — RACI / responsibility assignment matrix. */
function raciMatrix(): OrgChart {
  const raci = (letter: string): TableCell => {
    const status: CellStatus | undefined =
      letter === 'A' ? 'warn' : letter === 'R' ? 'good' : letter === 'C' ? 'info' : undefined
    return cell(letter, status)
  }
  const row = (task: string, letters: string[]) => ({ cells: [cell(task), ...letters.map(raci)] })
  return {
    version: 1,
    meta: {
      title: 'RACI — Responsibility Assignment',
      showTitle: true,
      layout: 'table',
      caption: 'R = Responsible · A = Accountable · C = Consulted · I = Informed.',
    },
    roots: placeholderRoots(),
    groups: [],
    comms: [],
    legend: [],
    table: {
      columns: [
        { label: 'PWS Task / Activity', width: 230, align: 'left' },
        { label: 'PM' },
        { label: 'Deputy PM' },
        { label: 'Ops Lead' },
        { label: 'Eng Lead' },
        { label: 'QA / Safety' },
        { label: 'Customer COR' },
      ],
      rows: [
        row('Program management & control', ['A', 'R', 'I', 'I', 'I', 'C']),
        row('Test operations execution', ['C', 'A', 'R', 'C', 'I', 'I']),
        row('Engineering & technical support', ['I', 'C', 'A', 'R', 'C', 'I']),
        row('Quality, safety & mission assurance', ['I', 'I', 'C', 'C', 'A', 'I']),
        row('Contract & financial management', ['A', 'C', 'I', 'I', 'I', 'C']),
        row('Risk & schedule management', ['A', 'R', 'C', 'C', 'I', 'I']),
      ],
    },
  }
}

/** Template 12 — QASP / SLA metrics dashboard with green/amber/red ratings. */
function qaspMetrics(): OrgChart {
  const row = (obj: string, std: string, aql: string, method: string, current: TableCell) => ({
    cells: [cell(obj), cell(std), cell(aql), cell(method), current],
  })
  return {
    version: 1,
    meta: {
      title: 'QASP — Performance Metrics',
      showTitle: true,
      layout: 'table',
      caption:
        'Green meets or exceeds the standard; amber is within the acceptable threshold; red is below threshold and triggers a corrective action plan.',
    },
    roots: placeholderRoots(),
    groups: [],
    comms: [],
    legend: [],
    table: {
      columns: [
        { label: 'Performance Objective', width: 220, align: 'left' },
        { label: 'Standard', width: 150, align: 'left' },
        { label: 'Threshold (AQL)' },
        { label: 'Surveillance Method', width: 160, align: 'left' },
        { label: 'Current' },
      ],
      rows: [
        row('System availability', '99.9% uptime', '≥ 99.5%', 'Automated monitoring', cell('99.94%', 'good')),
        row('Incident response (Sev-1)', 'Acknowledge ≤ 15 min', '≤ 30 min', 'Ticket audit', cell('22 min', 'warn')),
        row('Change success rate', '≥ 98%', '≥ 95%', 'CAB review', cell('99.1%', 'good')),
        row('Deliverable on-time', '100% on schedule', '≥ 95%', 'CDRL tracking', cell('93%', 'bad')),
        row('Customer satisfaction', '≥ 4.5 / 5', '≥ 4.0 / 5', 'Quarterly survey', cell('4.6 / 5', 'good')),
      ],
    },
  }
}

/** Template 13 — Section L-to-M compliance crosswalk. */
function complianceCrosswalk(): OrgChart {
  const row = (l: string, loc: string, m: string, pws: string, status: TableCell) => ({
    cells: [cell(l), cell(loc), cell(m), cell(pws), status],
  })
  return {
    version: 1,
    meta: {
      title: 'Section L-to-M Compliance Crosswalk',
      showTitle: true,
      layout: 'table',
      caption: 'Every Section L instruction is traced to its proposal location, the Section M factor it satisfies, and the PWS it addresses.',
    },
    roots: placeholderRoots(),
    groups: [],
    comms: [],
    legend: [],
    table: {
      columns: [
        { label: 'Section L (Instruction)', width: 210, align: 'left' },
        { label: 'Proposal Location', width: 150, align: 'left' },
        { label: 'Section M (Evaluation Factor)', width: 200, align: 'left' },
        { label: 'PWS' },
        { label: 'Status' },
      ],
      rows: [
        { header: true, cells: [cell('Volume I — Technical & Management')] },
        row('L.3.1 Technical Approach', 'Vol I, §2', 'M.2 Technical', '3.1–3.10', cell('Addressed', 'good')),
        row('L.3.2 Management Approach', 'Vol I, §3', 'M.3 Management', '2.1–2.4', cell('Addressed', 'good')),
        row('L.3.3 Staffing & Key Personnel', 'Vol I, §4', 'M.3 Management', '2.4', cell('Addressed', 'good')),
        row('L.3.5 Transition Plan', 'Vol I, §5', 'M.3 Management', '3.20', cell('Draft', 'warn')),
        { header: true, cells: [cell('Volume II — Past Performance & Small Business')] },
        row('L.3.4 Past Performance', 'Vol II, §1', 'M.4 Past Performance', '—', cell('Addressed', 'good')),
        row('L.3.6 Small Business Participation', 'Vol II, §2', 'M.5 Small Business', '—', cell('Open', 'bad')),
      ],
    },
  }
}

/** Shared builder for a table-layout chart (hidden placeholder root + table). */
function tableChart(title: string, caption: string, table: OrgChart['table']): OrgChart {
  return {
    version: 1,
    meta: { title, showTitle: true, layout: 'table', caption },
    roots: placeholderRoots(),
    groups: [],
    comms: [],
    legend: [],
    table,
  }
}

/** Template 14 — past-performance relevance matrix (CPARS). */
function relevanceMatrix(): OrgChart {
  const row = (contract: string, cust: string, val: string, match: string, cpars: TableCell) => ({
    cells: [cell(contract), cell(cust), cell(val), cell(match), cpars],
  })
  return tableChart(
    'Past-Performance Relevance Matrix',
    "Relevance is judged against this RFP's scope, size, and complexity; CPARS ratings are from the referenced periods.",
    {
      columns: [
        { label: 'Contract', width: 200, align: 'left' },
        { label: 'Customer', width: 140, align: 'left' },
        { label: 'Value / Period', width: 140, align: 'left' },
        { label: 'Scope Relevance' },
        { label: 'CPARS' },
      ],
      rows: [
        row('AEDC Test Operations Support', 'USAF AFTC', '$180M / 2019–24', 'High', cell('Exceptional', 'good')),
        row('Propulsion Test Services', 'NASA SSC', '$95M / 2020–25', 'High', cell('Very Good', 'good')),
        row('Range Instrumentation', 'USSF SLD 45', '$60M / 2018–23', 'Medium', cell('Satisfactory', 'warn')),
        row('Base Ops & Sustainment', 'USAF AFMC', '$120M / 2021–26', 'High', cell('Exceptional', 'good')),
      ],
    },
  )
}

/** Template 15 — labor-category / skills matrix mapped to PWS. */
function skillsMatrix(): OrgChart {
  const row = (labcat: string, skills: string, pws: string, fte: string) => ({
    cells: [cell(labcat), cell(skills), cell(pws), cell(fte)],
  })
  return tableChart(
    'Labor Category & Skills Matrix',
    'Key labor categories mapped to the PWS tasks they cover and the skills and certifications required.',
    {
      columns: [
        { label: 'Labor Category', width: 190, align: 'left' },
        { label: 'Key Skills / Certifications', width: 240, align: 'left' },
        { label: 'PWS Tasks' },
        { label: 'FTE' },
      ],
      rows: [
        row('Program Manager', 'PMP, DAWIA; 15+ yrs test operations', '2.1, 3.4', '1'),
        row('Test Engineer (Senior)', 'Instrumentation, DAQ, test conduct', '3.1–3.3', '8'),
        row('Systems Engineer', 'INCOSE CSEP; MBSE / modeling', '3.6, 3.7', '5'),
        row('Cyber / RMF Analyst', 'CISSP; RMF, eMASS, cATO', '3.10', '3'),
        row('Quality / Safety Lead', 'ASQ CMQ/OE; ISO 9001', '3.14, 3.24', '2'),
      ],
    },
  )
}

/** Template 16 — requirements-to-solution traceability. */
function traceabilityMatrix(): OrgChart {
  const row = (req: string, sol: string, proof: string, vol: string) => ({
    cells: [cell(req), cell(sol), cell(proof), cell(vol)],
  })
  return tableChart(
    'Requirements-to-Solution Traceability',
    'Each requirement is traced to our solution and the proof that we deliver it.',
    {
      columns: [
        { label: 'Requirement (PWS)', width: 150, align: 'left' },
        { label: 'Our Solution', width: 230, align: 'left' },
        { label: 'Proof / Evidence', width: 220, align: 'left' },
        { label: 'Vol Ref' },
      ],
      rows: [
        row('3.1 Turbine test', 'Certified test-cell teams + digital DAQ', 'AEDC CPARS Exceptional; 99.9% availability', 'Vol I §2.1'),
        row('3.6 Instrumentation', 'ID&C lab + calibration program', 'ISO 17025 accreditation', 'Vol I §2.3'),
        row('3.10 Digital modernization', 'DevSecOps pipeline; continuous ATO', 'NASA cloud-migration case study', 'Vol I §2.4'),
        row('2.4 Staffing', '90-day phase-in; 95% incumbent capture', 'Transition plan; commitment letters', 'Vol I §4'),
      ],
    },
  )
}

/** Template 17 — us-vs-status-quo comparison. */
function comparisonMatrix(): OrgChart {
  const row = (dim: string, sq: string, ours: string, outcome: TableCell) => ({
    cells: [cell(dim), cell(sq), cell(ours), outcome],
  })
  return tableChart(
    'Our Approach vs. the Status Quo',
    'How our approach improves on the current state across the dimensions the customer cares about.',
    {
      columns: [
        { label: 'Dimension', width: 160, align: 'left' },
        { label: 'Status Quo / Incumbent', width: 220, align: 'left' },
        { label: 'Astrion Approach', width: 230, align: 'left' },
        { label: 'Outcome' },
      ],
      rows: [
        row('Transition risk', '12-month ramp with coverage gaps', 'Proven 90-day phase-in, 95% capture', cell('Faster, safer', 'good')),
        row('Availability', '~98%, reactive maintenance', 'Predictive maintenance + monitoring', cell('99.9%', 'good')),
        row('Cost', 'Fixed staffing, limited automation', 'Automation + right-sized labor mix', cell('−12% O&M', 'good')),
        row('Cyber posture', 'Legacy ATO, manual controls', 'Zero Trust + continuous ATO', cell('Continuous ATO', 'good')),
      ],
    },
  )
}

/** Template 18 — capability-to-requirement mapping. */
function capabilityMap(): OrgChart {
  const row = (req: string, cap: string, maturity: TableCell, evidence: string) => ({
    cells: [cell(req), cell(cap), maturity, cell(evidence)],
  })
  return tableChart(
    'Capability-to-Requirement Mapping',
    'Every RFP capability requirement mapped to a proven Astrion capability, with maturity and evidence.',
    {
      columns: [
        { label: 'RFP Requirement', width: 210, align: 'left' },
        { label: 'Astrion Capability', width: 220, align: 'left' },
        { label: 'Maturity' },
        { label: 'Evidence', width: 170, align: 'left' },
      ],
      rows: [
        row('Full-spectrum test operations', '5 test complexes, 400+ engineers', cell('Operational', 'good'), 'AEDC, NASA SSC'),
        row('Digital engineering / MBSE', 'DE center of excellence', cell('Operational', 'good'), 'INCOSE awards'),
        row('Cyber / RMF at scale', 'RMF factory, eMASS automation', cell('Scaling', 'warn'), 'DoD ATOs'),
        row('OCONUS surge', 'Deployable field teams', cell('Developing', 'warn'), 'CENTCOM support'),
      ],
    },
  )
}

/** Template 19 — a 5×5 program risk cube with mitigation arrows. Each risk
 *  carries its current (L, C) position and the residual position its funded
 *  mitigation drives it to. */
function riskCube(): OrgChart {
  const risk = (
    code: string,
    title: string,
    likelihood: number,
    consequence: number,
    residual?: { likelihood: number; consequence: number },
  ): RiskItem => ({
    id: uid('r'),
    code,
    title,
    likelihood,
    consequence,
    ...(residual ? { residual } : {}),
  })
  return {
    version: 1,
    meta: {
      title: 'Program Risk Assessment',
      showTitle: true,
      layout: 'risk',
      caption:
        'Every moderate and high risk carries a funded, named mitigation that moves it down and left before full operational capability — no risk is accepted without a burn-down path.',
    },
    roots: placeholderRoots(),
    groups: [],
    comms: [],
    legend: [],
    risk: {
      risks: [
        risk('R1', 'Incumbent staff capture falls below 90%', 4, 4, { likelihood: 2, consequence: 3 }),
        risk('R2', 'Security clearance processing delays', 3, 4, { likelihood: 2, consequence: 2 }),
        risk('R3', 'Legacy data migration exceeds cutover window', 3, 3, { likelihood: 1, consequence: 3 }),
        risk('R4', 'Long-lead test equipment availability', 2, 4, { likelihood: 2, consequence: 2 }),
        risk('R5', 'Surge tasking exceeds staffing plan', 4, 2, { likelihood: 2, consequence: 2 }),
      ],
    },
  }
}

/** Shared builder for an xy-layout chart (hidden placeholder root + series). */
function xyChart(
  title: string,
  caption: string,
  xLabel: string,
  yLabel: string,
  series: Omit<XYSeries, 'id'>[],
): OrgChart {
  return {
    version: 1,
    meta: { title, showTitle: true, layout: 'xy', caption },
    roots: placeholderRoots(),
    groups: [],
    comms: [],
    legend: [],
    xy: { xLabel, yLabel, series: series.map((s) => ({ ...s, id: uid('s') })) },
  }
}

/** Points from [x, y] tuples, to keep the series below readable. */
const pts = (...pairs: [number, number][]) => pairs.map(([x, y]) => ({ x, y }))

/** Template 20 — staffing ramp: filled area of cleared staff on site against
 *  the required level, week by week through phase-in. */
function staffingRamp(): OrgChart {
  return xyChart(
    'Staffing Ramp — Phase-In',
    'Named, cleared staff reach 96% of the required level by week 8 and 100% before full operational capability — incumbent capture and pre-cleared pipeline hires carry the early ramp.',
    'Weeks after award',
    'Cleared staff on site (%)',
    [
      {
        label: 'Astrion staffing',
        kind: 'area',
        variant: 'secondary',
        points: pts([0, 18], [2, 44], [4, 63], [6, 81], [8, 96], [10, 98], [12, 100]),
      },
      {
        label: 'Required level',
        kind: 'line',
        variant: 'accent',
        points: pts([0, 100], [12, 100]),
      },
    ],
  )
}

/** Template 21 — risk burndown: planned vs. actual weighted risk exposure. */
function riskBurndown(): OrgChart {
  return xyChart(
    'Risk Burndown',
    'Weighted risk exposure burns down ahead of plan: mitigations funded at award retire the transition and staffing risks in the first two quarters.',
    'Months after award',
    'Weighted risk exposure',
    [
      {
        label: 'Planned burndown',
        kind: 'line',
        variant: 'tertiary',
        points: pts([0, 42], [3, 34], [6, 25], [9, 15], [12, 8]),
      },
      {
        label: 'Actual / projected',
        kind: 'line',
        variant: 'primary',
        points: pts([0, 42], [3, 29], [6, 19], [9, 10], [12, 4]),
      },
    ],
  )
}

/** Template 22 — ROI & benefits: annual savings bars with the cumulative
 *  benefit line over the contract years. */
function roiBenefits(): OrgChart {
  return xyChart(
    'ROI & Cumulative Benefits',
    'Automation and predictive maintenance return $18.7M over five years — annual savings grow as tooling deploys, and the investment pays back inside year two.',
    'Contract year',
    'Savings ($M)',
    [
      {
        label: 'Annual savings',
        kind: 'bar',
        variant: 'secondary',
        points: pts([1, 1.8], [2, 3.2], [3, 4.1], [4, 4.6], [5, 5.0]),
      },
      {
        label: 'Cumulative benefit',
        kind: 'line',
        variant: 'primary',
        points: pts([1, 1.8], [2, 5.0], [3, 9.1], [4, 13.7], [5, 18.7]),
      },
    ],
  )
}

export const templates: { key: string; label: string; build: () => OrgChart }[] = [
  { key: 'simple-hierarchy', label: 'Simple Hierarchy (clean top-down)', build: simpleHierarchy },
  { key: 'functional-divisions', label: 'Functional Divisions (department stacks)', build: functionalDivisions },
  { key: 'program-office', label: 'Program Office (capability stacks)', build: programOffice },
  { key: 'director-level', label: 'Director Level (PWS & deliverables)', build: directorLevel },
  { key: 'wbs', label: 'Work Breakdown Structure (numbered)', build: wbs },
  { key: 'teaming', label: 'Teaming & Workshare (prime / subs)', build: teaming },
  { key: 'transition', label: 'Transition Schedule (30/60/90-day)', build: transitionSchedule },
  { key: 'risk-cube', label: 'Risk Cube (5×5 heatmap)', build: riskCube },
  { key: 'staffing-ramp', label: 'Staffing Ramp (area chart)', build: staffingRamp },
  { key: 'risk-burndown', label: 'Risk Burndown (line chart)', build: riskBurndown },
  { key: 'roi', label: 'ROI & Benefits (bar + line)', build: roiBenefits },
  { key: 'raci', label: 'RACI Matrix (responsibility)', build: raciMatrix },
  { key: 'qasp', label: 'QASP / SLA Metrics (table)', build: qaspMetrics },
  { key: 'crosswalk', label: 'Section L-to-M Crosswalk (table)', build: complianceCrosswalk },
  { key: 'relevance', label: 'Relevance Matrix (past performance)', build: relevanceMatrix },
  { key: 'skills', label: 'Labor Category & Skills Matrix', build: skillsMatrix },
  { key: 'traceability', label: 'Requirements Traceability (table)', build: traceabilityMatrix },
  { key: 'comparison', label: 'Us vs. Status Quo (comparison)', build: comparisonMatrix },
  { key: 'capability-map', label: 'Capability-to-Requirement Map', build: capabilityMap },
  { key: 'joint-venture', label: 'Joint Venture (board, PMO & TMs)', build: jointVenture },
  { key: 'mentor-protege', label: 'Mentor-Protégé JV (multi-site)', build: mentorProtege },
  { key: 'pmo-comms', label: 'PMO (lines of communication)', build: pmoComms },
]

/** The chart shown on first load (before any localStorage autosave exists). */
export const DEFAULT_TEMPLATE_KEY = 'director-level'
