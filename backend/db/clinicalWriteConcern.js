export const CLINICAL_WRITE_CONCERN = {
    w: "majority",
    j: true,
    wtimeout: 5000,
};

export const CLINICAL_QUERY_WRITE_OPTIONS = {
    writeConcern: CLINICAL_WRITE_CONCERN,
};
