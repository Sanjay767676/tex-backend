const path = require('path');
const columnResolver = require('../src/utils/columnResolver');
const { buildHeaderMap, getDayType } = columnResolver;

// Mock headers from a Google Sheet
const headers = [
    'College Name :',
    '1.NAME OF COLLEGE',
    'College',
    'Day 1',
    'List of Departments',
    'Event 1',
    'Technical 1',
    'Day 2',
    'Event 2',
];

const headerMap = buildHeaderMap(headers);

console.log('Header Map:', headerMap);

headers.forEach((h) => {
    const day = getDayType(h);
    console.log(`Header: "${h}" => Day Type: ${day}`);
});

// Test cleanCollegeName from pdfService
const pdfService = require('../src/services/pdfService');
const { cleanCollegeName } = pdfService;
const collegeSamples = [
    'College Name :',
    '1.NAME OF COLLEGE',
    '2.NAME OF COLLEGE',
    'College',
    'Institute',
];
collegeSamples.forEach((c) => {
    console.log(`Original: "${c}" => Cleaned: "${cleanCollegeName(c)}"`);
});
