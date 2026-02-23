/**
 * Column Alias Mapping Configuration
 * 
 * This file defines smart aliases for Google Sheet headers to handle variations
 * in column names without breaking the backend logic.
 * 
 * Each alias key maps to an array of possible header variations.
 * The system will try each variation (case-insensitive, trimmed) until a match is found.
 */

const columnAliases = {
    // Student name column variations
    name: [
        'Name of the Student :',
        'Name of the Student',
        'Student Name',
        'Name',
        'Full Name',
        'Participant Name',
    ],

    // Email address column variations
    email: [
        'Email ID:',
        'Email ID',
        'Student Email',
        'Email Address',
        'Email',
        'E-mail',
        'Mail',
    ],

    // Payment status column variations
    paymentStatus: [
        'Payment status',
        'Payment Status',
        'Status',
        'Payment',
    ],

    // Token column variations
    token: [
        'Token',
        'Registration Token',
        'Unique Token',
    ],

    // Timestamp column variations
    timestamp: [
        'Timestamp',
        'Time Stamp',
        'Submission Time',
        'Date',
        'Submitted At',
    ],

    // Attendance column variations
    attendance: [
        'Attendance',
        'Present',
        'Attendance Status',
        'Check-in',
    ],

    // Mail sent tracking column variations
    mailSent: [
        'Mail_Sent',
        'Mail Sent',
        'Email Sent',
        'Confirmation Sent',
    ],

    // Token generation timestamp column variations
    tokenGeneratedTime: [
        'Token_Generated_Time',
        'Token Generated Time',
        'Token Time',
        'Generated Time',
    ],

    // QR code link column variations
    qrLink: [
        'QR_Links',
        'QR_Link',
        'QR Link',
        'QR Code',
        'Scan Link',
    ],

    // Day 1 event markers (for event extraction)
    day1: [
        'day 1',
        'day1',
        'day_1',
        'first day',
    ],

    // Day 2 event markers (for event extraction)
    day2: [
        'day 2',
        'day2',
        'day_2',
        'second day',
        'Day 2 - Technical',
        'Day 2 - Non-Technical',
    ],

    // Department column variations
    department: [
        'Department',
        'Dept',
        'Branch',
        'Stream',
        'Course',
        'Year & Dept',
        'Year and Department',
    ],
};

module.exports = columnAliases;
