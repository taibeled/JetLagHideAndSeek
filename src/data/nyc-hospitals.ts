// Curated NYC hospital list, geocoded from NYC_All_Hospitals.xlsx.
// Hospitals within 1000 feet (305m) of each other are merged into a single point.
// Generated: 2026-05-14 — do not edit by hand, re-run scripts/geocode-nyc-hospitals.py

export interface NycHospital {
    name: string;
    lat: number;
    lng: number;
    /** OSM-style ref for toggle/disable tracking */
    ref: string;
    /** Original hospital names that were merged into this point */
    members: string[];
}

export const NYC_HOSPITALS: NycHospital[] = [
    {
        name: "Bronx Psychiatric Center / New York City Childrens Center - Bronx Campus (FKA Bronx Childrens Psychiatric Center)",
        lat: 40.846509,
        lng: -73.839401,
        ref: "bronx-psychiatric-center-new-york-city-c",
        members: [
            "Bronx Psychiatric Center",
            "New York City Childrens Center - Bronx Campus (FKA Bronx Childrens Psychiatric Center)",
        ],
    },
    {
        name: "BronxCare Hospital Center - Fulton Campus",
        lat: 40.831416,
        lng: -73.903173,
        ref: "bronxcare-hospital-center-fulton-campus",
        members: ["BronxCare Hospital Center - Fulton Campus"],
    },
    {
        name: "BronxCare Hospital Center - Grand Concourse Campus",
        lat: 40.843489,
        lng: -73.910573,
        ref: "bronxcare-hospital-center-grand-concours",
        members: ["BronxCare Hospital Center - Grand Concourse Campus"],
    },
    {
        name: "Brookdale University Hospital Medical Center (FKA Brookdale Hospital Medical Center)",
        lat: 40.6598,
        lng: -73.9135,
        ref: "brookdale-university-hospital-medical-ce",
        members: [
            "Brookdale University Hospital Medical Center (FKA Brookdale Hospital Medical Center)",
        ],
    },
    {
        name: "Brooklyn Hospital Center at Downtown Campus",
        lat: 40.690544,
        lng: -73.977933,
        ref: "brooklyn-hospital-center-at-downtown-cam",
        members: ["Brooklyn Hospital Center at Downtown Campus"],
    },
    {
        name: "Brooklyn VA Medical Center",
        lat: 40.607441,
        lng: -74.023724,
        ref: "brooklyn-va-medical-center",
        members: ["Brooklyn VA Medical Center"],
    },
    {
        name: "Calvary Hospital - Bronx Campus / Montefiore Hospital - Einstein Campus (AKA Jack D Weiler Hospital)",
        lat: 40.848626,
        lng: -73.845013,
        ref: "calvary-hospital-bronx-campus-montefiore",
        members: [
            "Calvary Hospital - Bronx Campus",
            "Montefiore Hospital - Einstein Campus (AKA Jack D Weiler Hospital)",
        ],
    },
    {
        name: "Calvary Hospital - Brooklyn Campus / NYU Langone Hospital - Brooklyn (FKA NYU Lutheran Medical Center)",
        lat: 40.646673,
        lng: -74.020906,
        ref: "calvary-hospital-brooklyn-campus-nyu-lan",
        members: [
            "Calvary Hospital - Brooklyn Campus",
            "NYU Langone Hospital - Brooklyn (FKA NYU Lutheran Medical Center)",
        ],
    },
    {
        name: "Childrens Hospital at Montefiore / Montefiore Hospital - Moses Campus / NYC Health and Hospitals - North Central Bronx (FKA North Central Bronx Hospital)",
        lat: 40.880272,
        lng: -73.880046,
        ref: "childrens-hospital-at-montefiore-montefi",
        members: [
            "Childrens Hospital at Montefiore",
            "Montefiore Hospital - Moses Campus",
            "NYC Health and Hospitals - North Central Bronx (FKA North Central Bronx Hospital)",
        ],
    },
    {
        name: "Creedmoor Psychiatric Center",
        lat: 40.741081,
        lng: -73.730705,
        ref: "creedmoor-psychiatric-center",
        members: ["Creedmoor Psychiatric Center"],
    },
    {
        name: "Flushing Hospital Medical Center",
        lat: 40.755397,
        lng: -73.816507,
        ref: "flushing-hospital-medical-center",
        members: ["Flushing Hospital Medical Center"],
    },
    {
        name: "Gracie Square Hospital",
        lat: 40.769709,
        lng: -73.952975,
        ref: "gracie-square-hospital",
        members: ["Gracie Square Hospital"],
    },
    {
        name: "Helen L and Martin S Kimmel Pavilion / NYU Langone Hassenfeld Childrens Hospital",
        lat: 40.7416,
        lng: -73.9718,
        ref: "helen-l-and-martin-s-kimmel-pavilion-nyu",
        members: [
            "Helen L and Martin S Kimmel Pavilion",
            "NYU Langone Hassenfeld Childrens Hospital",
        ],
    },
    {
        name: "Hospital for Special Surgery (campus)",
        lat: 40.764325,
        lng: -73.954664,
        ref: "hospital-for-special-surgery-campus",
        members: [
            "Hospital for Special Surgery",
            "NewYork-Presbyterian Alexandra Cohen Hospital for Women & Newborns",
            "NewYork-Presbyterian Komansky Childrens Hospital",
            "NewYork-Presbyterian Weill Cornell Medical Center",
            "Rockefeller University Hospital",
        ],
    },
    {
        name: "Interfaith Medical Center",
        lat: 40.678578,
        lng: -73.937499,
        ref: "interfaith-medical-center",
        members: ["Interfaith Medical Center"],
    },
    {
        name: "Jamaica Hospital Medical Center",
        lat: 40.700367,
        lng: -73.816497,
        ref: "jamaica-hospital-medical-center",
        members: ["Jamaica Hospital Medical Center"],
    },
    {
        name: "James J Peters VA Medical Center",
        lat: 40.8672,
        lng: -73.905511,
        ref: "james-j-peters-va-medical-center",
        members: ["James J Peters VA Medical Center"],
    },
    {
        name: "Kingsboro Psychiatric Center / Kingsbrook Jewish Medical Center",
        lat: 40.65853,
        lng: -73.933835,
        ref: "kingsboro-psychiatric-center-kingsbrook",
        members: [
            "Kingsboro Psychiatric Center",
            "Kingsbrook Jewish Medical Center",
        ],
    },
    {
        name: "Kirby Forensic Psychiatric Center / Manhattan Psychiatric Center",
        lat: 40.789226,
        lng: -73.929835,
        ref: "kirby-forensic-psychiatric-center-manhat",
        members: [
            "Kirby Forensic Psychiatric Center",
            "Manhattan Psychiatric Center",
        ],
    },
    {
        name: "Lenox Hill Hospital",
        lat: 40.773643,
        lng: -73.960862,
        ref: "lenox-hill-hospital",
        members: ["Lenox Hill Hospital"],
    },
    {
        name: "Long Island Jewish Forest Hills (FKA Forest Hills Hospital)",
        lat: 40.728949,
        lng: -73.85014,
        ref: "long-island-jewish-forest-hills-fka-fore",
        members: [
            "Long Island Jewish Forest Hills (FKA Forest Hills Hospital)",
        ],
    },
    {
        name: "Maimonides Childrens Hospital / Maimonides Medical Center",
        lat: 40.63942,
        lng: -73.998107,
        ref: "maimonides-childrens-hospital-maimonides",
        members: ["Maimonides Childrens Hospital", "Maimonides Medical Center"],
    },
    {
        name: "Maimonides Midwood Community Hospital (FKA New York Community Hospital of Brooklyn)",
        lat: 40.613893,
        lng: -73.948569,
        ref: "maimonides-midwood-community-hospital-fk",
        members: [
            "Maimonides Midwood Community Hospital (FKA New York Community Hospital of Brooklyn)",
        ],
    },
    {
        name: "Manhattan VA Medical Center (AKA Margaret Cochran Corbin VA Campus) / NYC Health and Hospitals - Bellevue (FKA Bellevue Hospital Center)",
        lat: 40.73801,
        lng: -73.976047,
        ref: "manhattan-va-medical-center-aka-margaret",
        members: [
            "Manhattan VA Medical Center (AKA Margaret Cochran Corbin VA Campus)",
            "NYC Health and Hospitals - Bellevue (FKA Bellevue Hospital Center)",
        ],
    },
    {
        name: "Memorial Sloan Kettering Cancer Center",
        lat: 40.764442,
        lng: -73.956955,
        ref: "memorial-sloan-kettering-cancer-center",
        members: ["Memorial Sloan Kettering Cancer Center"],
    },
    {
        name: "Montefiore Wakefield Campus",
        lat: 40.893213,
        lng: -73.861378,
        ref: "montefiore-wakefield-campus",
        members: ["Montefiore Wakefield Campus"],
    },
    {
        name: "Mount Sinai Brooklyn (AKA Mount Sinai Beth Israel Brooklyn Medical Center - Kings Highway Division Brooklyn)",
        lat: 40.618672,
        lng: -73.942974,
        ref: "mount-sinai-brooklyn-aka-mount-sinai-bet",
        members: [
            "Mount Sinai Brooklyn (AKA Mount Sinai Beth Israel Brooklyn Medical Center - Kings Highway Division Brooklyn)",
        ],
    },
    {
        name: "Mount Sinai Kravis Childrens Hospital / The Mount Sinai Hospital (AKA Mount Sinai Medical Center)",
        lat: 40.789879,
        lng: -73.953241,
        ref: "mount-sinai-kravis-childrens-hospital-th",
        members: [
            "Mount Sinai Kravis Childrens Hospital",
            "The Mount Sinai Hospital (AKA Mount Sinai Medical Center)",
        ],
    },
    {
        name: "Mount Sinai Morningside (FKA Mount Sinai St Lukes) / Mount Sinai Rehabilitation Center at Mount Sinai Morningside",
        lat: 40.805237,
        lng: -73.961388,
        ref: "mount-sinai-morningside-fka-mount-sinai",
        members: [
            "Mount Sinai Morningside (FKA Mount Sinai St Lukes)",
            "Mount Sinai Rehabilitation Center at Mount Sinai Morningside",
        ],
    },
    {
        name: "Mount Sinai Queens",
        lat: 40.768107,
        lng: -73.924939,
        ref: "mount-sinai-queens",
        members: ["Mount Sinai Queens"],
    },
    {
        name: "Mount Sinai West (FKA Roosevelt Hospital Mount Sinai Roosevelt)",
        lat: 40.769713,
        lng: -73.986907,
        ref: "mount-sinai-west-fka-roosevelt-hospital",
        members: [
            "Mount Sinai West (FKA Roosevelt Hospital Mount Sinai Roosevelt)",
        ],
    },
    {
        name: "NYC Health and Hospitals - Carter (FKA Henry J Carter Specialty Hospital)",
        lat: 40.803012,
        lng: -73.941047,
        ref: "nyc-health-and-hospitals-carter-fka-henr",
        members: [
            "NYC Health and Hospitals - Carter (FKA Henry J Carter Specialty Hospital)",
        ],
    },
    {
        name: "NYC Health and Hospitals - Elmhurst (FKA Elmhurst Hospital Center)",
        lat: 40.744775,
        lng: -73.88565,
        ref: "nyc-health-and-hospitals-elmhurst-fka-el",
        members: [
            "NYC Health and Hospitals - Elmhurst (FKA Elmhurst Hospital Center)",
        ],
    },
    {
        name: "NYC Health and Hospitals - Harlem (FKA Harlem Hospital Center)",
        lat: 40.81471,
        lng: -73.939278,
        ref: "nyc-health-and-hospitals-harlem-fka-harl",
        members: [
            "NYC Health and Hospitals - Harlem (FKA Harlem Hospital Center)",
        ],
    },
    {
        name: "NYC Health and Hospitals - Jacobi (FKA Jacobi Medical Center)",
        lat: 40.8564,
        lng: -73.847412,
        ref: "nyc-health-and-hospitals-jacobi-fka-jaco",
        members: [
            "NYC Health and Hospitals - Jacobi (FKA Jacobi Medical Center)",
        ],
    },
    {
        name: "NYC Health and Hospitals - Kings County (FKA Kings County Hospital Center) / University Hospital at Downstate (AKA University Hospital of Brooklyn at SUNY Downstate Medical Center)",
        lat: 40.655698,
        lng: -73.944056,
        ref: "nyc-health-and-hospitals-kings-county-fk",
        members: [
            "NYC Health and Hospitals - Kings County (FKA Kings County Hospital Center)",
            "University Hospital at Downstate (AKA University Hospital of Brooklyn at SUNY Downstate Medical Center)",
        ],
    },
    {
        name: "NYC Health and Hospitals - Lincoln (FKA Lincoln Medical & Mental Health Center)",
        lat: 40.817033,
        lng: -73.92437,
        ref: "nyc-health-and-hospitals-lincoln-fka-lin",
        members: [
            "NYC Health and Hospitals - Lincoln (FKA Lincoln Medical & Mental Health Center)",
        ],
    },
    {
        name: "NYC Health and Hospitals - Metropolitan (FKA Metropolitan Hospital Center)",
        lat: 40.785037,
        lng: -73.944971,
        ref: "nyc-health-and-hospitals-metropolitan-fk",
        members: [
            "NYC Health and Hospitals - Metropolitan (FKA Metropolitan Hospital Center)",
        ],
    },
    {
        name: "NYC Health and Hospitals - Queens (FKA Queens Hospital Center)",
        lat: 40.71771,
        lng: -73.806014,
        ref: "nyc-health-and-hospitals-queens-fka-quee",
        members: [
            "NYC Health and Hospitals - Queens (FKA Queens Hospital Center)",
        ],
    },
    {
        name: "NYC Health and Hospitals - Woodhull (FKA Woodhull Medical and Mental Health Center)",
        lat: 40.699336,
        lng: -73.942747,
        ref: "nyc-health-and-hospitals-woodhull-fka-wo",
        members: [
            "NYC Health and Hospitals - Woodhull (FKA Woodhull Medical and Mental Health Center)",
        ],
    },
    {
        name: "NYC Health and Hospitals South Brooklyn Health (AKA Ruth Bader Ginsburg Hospital)",
        lat: 40.585459,
        lng: -73.964872,
        ref: "nyc-health-and-hospitals-south-brooklyn",
        members: [
            "NYC Health and Hospitals South Brooklyn Health (AKA Ruth Bader Ginsburg Hospital)",
        ],
    },
    {
        name: "NYU Langone Orthopedic Hospital (FKA NYU Hospital for Joint Diseases)",
        lat: 40.734394,
        lng: -73.982991,
        ref: "nyu-langone-orthopedic-hospital-fka-nyu",
        members: [
            "NYU Langone Orthopedic Hospital (FKA NYU Hospital for Joint Diseases)",
        ],
    },
    {
        name: "New York City Childrens Center - Queens Campus (FKA Queens Childrens Psychiatric Center)",
        lat: 40.745442,
        lng: -73.725772,
        ref: "new-york-city-childrens-center-queens-ca",
        members: [
            "New York City Childrens Center - Queens Campus (FKA Queens Childrens Psychiatric Center)",
        ],
    },
    {
        name: "New York Eye and Ear Infirmary of Mount Sinai",
        lat: 40.73188,
        lng: -73.984581,
        ref: "new-york-eye-and-ear-infirmary-of-mount",
        members: ["New York Eye and Ear Infirmary of Mount Sinai"],
    },
    {
        name: "New York State Psychiatric Institute",
        lat: 40.842473,
        lng: -73.944602,
        ref: "new-york-state-psychiatric-institute",
        members: ["New York State Psychiatric Institute"],
    },
    {
        name: "NewYork-Presbyterian Allen Hospital",
        lat: 40.873278,
        lng: -73.912864,
        ref: "newyork-presbyterian-allen-hospital",
        members: ["NewYork-Presbyterian Allen Hospital"],
    },
    {
        name: "NewYork-Presbyterian Brooklyn Methodist Hospital (FKA New York Methodist Hospital)",
        lat: 40.665846,
        lng: -73.986116,
        ref: "newyork-presbyterian-brooklyn-methodist",
        members: [
            "NewYork-Presbyterian Brooklyn Methodist Hospital (FKA New York Methodist Hospital)",
        ],
    },
    {
        name: "NewYork-Presbyterian Columbia University Irving Medical Center / Sloane Hospital for Women at NewYork-Presbyterian Morgan Stanley Childrens Hospital",
        lat: 40.840519,
        lng: -73.940955,
        ref: "newyork-presbyterian-columbia-university",
        members: [
            "NewYork-Presbyterian Columbia University Irving Medical Center",
            "Sloane Hospital for Women at NewYork-Presbyterian Morgan Stanley Childrens Hospital",
        ],
    },
    {
        name: "NewYork-Presbyterian Lower Manhattan Hospital (AKA New York Downtown Hospital)",
        lat: 40.71029,
        lng: -74.004937,
        ref: "newyork-presbyterian-lower-manhattan-hos",
        members: [
            "NewYork-Presbyterian Lower Manhattan Hospital (AKA New York Downtown Hospital)",
        ],
    },
    {
        name: "NewYork-Presbyterian Queens",
        lat: 40.747257,
        lng: -73.825187,
        ref: "newyork-presbyterian-queens",
        members: ["NewYork-Presbyterian Queens"],
    },
    {
        name: "Northwell Greenwich Village Hospital",
        lat: 40.676977,
        lng: -73.974048,
        ref: "northwell-greenwich-village-hospital",
        members: ["Northwell Greenwich Village Hospital"],
    },
    {
        name: "Richmond University Medical Center",
        lat: 40.636127,
        lng: -74.105511,
        ref: "richmond-university-medical-center",
        members: ["Richmond University Medical Center"],
    },
    {
        name: "Saint Marys Hospital for Children",
        lat: 40.7566,
        lng: -73.7278,
        ref: "saint-marys-hospital-for-children",
        members: ["Saint Marys Hospital for Children"],
    },
    {
        name: "South Beach Psychiatric Center",
        lat: 40.582628,
        lng: -74.080394,
        ref: "south-beach-psychiatric-center",
        members: ["South Beach Psychiatric Center"],
    },
    {
        name: "St Albans VA Medical Center",
        lat: 40.689701,
        lng: -73.768312,
        ref: "st-albans-va-medical-center",
        members: ["St Albans VA Medical Center"],
    },
    {
        name: "St Barnabas Hospital",
        lat: 40.809438,
        lng: -73.929359,
        ref: "st-barnabas-hospital",
        members: ["St Barnabas Hospital"],
    },
    {
        name: "St Johns Episcopal Hospital (AKA Episcopal Health Services Inc)",
        lat: 40.598688,
        lng: -73.753461,
        ref: "st-johns-episcopal-hospital-aka-episcopa",
        members: [
            "St Johns Episcopal Hospital (AKA Episcopal Health Services Inc)",
        ],
    },
    {
        name: "Staten Island University Hospital - North Campus",
        lat: 40.585438,
        lng: -74.084764,
        ref: "staten-island-university-hospital-north",
        members: ["Staten Island University Hospital - North Campus"],
    },
    {
        name: "Staten Island University Hospital - South Campus (AKA Staten Island University Hospital - Prince Bay)",
        lat: 40.517087,
        lng: -74.196186,
        ref: "staten-island-university-hospital-south",
        members: [
            "Staten Island University Hospital - South Campus (AKA Staten Island University Hospital - Prince Bay)",
        ],
    },
    {
        name: "The Specialty Hospital at ArchCare at Terence Cardinal Cooke Health Care Center (AKA ArchCare)",
        lat: 40.793747,
        lng: -73.950941,
        ref: "the-specialty-hospital-at-archcare-at-te",
        members: [
            "The Specialty Hospital at ArchCare at Terence Cardinal Cooke Health Care Center (AKA ArchCare)",
        ],
    },
    {
        name: "Tisch Hospital",
        lat: 40.742073,
        lng: -73.974337,
        ref: "tisch-hospital",
        members: ["Tisch Hospital"],
    },
    {
        name: "Wyckoff Heights Medical Center",
        lat: 40.704144,
        lng: -73.917708,
        ref: "wyckoff-heights-medical-center",
        members: ["Wyckoff Heights Medical Center"],
    },
    {
        name: "Zucker Hillside Hospital",
        lat: 40.751067,
        lng: -73.710925,
        ref: "zucker-hillside-hospital",
        members: ["Zucker Hillside Hospital"],
    },
];
