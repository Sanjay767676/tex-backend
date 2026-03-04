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
        'Name :',
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

    // Token column variations (Attendance)
    token: [
        'Token_1',
        'Token 1',
        'Token',
        'Registration Token',
        'Unique Token',
    ],

    // Token column variations (Lunch)
    token2: [
        'Token_2',
        'Token 2',
        'Lunch Token',
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

    // Registration Day column (explicit day selection)
    registrationDay: [
        'Event Happening Days :',
        'Event Happening Days',
        'Day :',
        'Day',
        'Registration Day',
        'Which Day?',
        'Select Day',
        'Day of Registration',
        'Attending Day',
    ],

    // Day 1 event markers (for event extraction)
    day1: [
        'day 1',
        'day1',
        'day_1',
        'first day',
        'Event 1',
        'Technical 1',
    ],

    // Day 2 event markers (for event extraction)
    day2: [
        'day 2',
        'day2',
        'day_2',
        'second day',
        'Day 2 - Technical',
        'Day 2 - Non-Technical',
        'Event 2',
        'Technical 2',
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

    // College column variations
    college: [
        'College Name :',
        'College Name',
        'NAME OF COLLEGE :',
        'NAME OF COLLEGE',
        'NAME OF THE COLLEGE :',
        'NAME OF THE COLLEGE',
        'College :',
        'Name of the College :',
        'Name of the College',
        'College',
        'Institute',
        'Institution Name',
        'College/Institute',
    ],


    // Lunch column variations
    lunch: [
        'LunchStatus',
        'Lunch Status',
        'Lunch_Status',
        'Lunch',
        'Lunch_Mark',
        'Lunch QR Scan',
    ],

    // Lunch QR link column variations
    lunchLink: [
        'Lunch_QR_Link',
        'Lunch QR Link',
        'Lunch_Link',
        'Lunch QR Code',
    ],
};

module.exports = columnAliases;
