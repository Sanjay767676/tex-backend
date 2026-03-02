const columnResolver = require('../src/utils/columnResolver');
const { buildHeaderMap, getDayType } = columnResolver;

// Sample headers
const headers = [
    'College Name :',
    '1.NAME OF COLLEGE',
    'Day 1',
    'List of Departments',
    'Event 1',
    'Technical 1',
    'Day 2',
    'Event 2',
    'Technical 2',
];

const headerMap = buildHeaderMap(headers);
console.log('Header Map:', headerMap);

headers.forEach((h) => {
    const day = getDayType(h);
    console.log(`Header: "${h}" => Day Type: ${day}`);
});
