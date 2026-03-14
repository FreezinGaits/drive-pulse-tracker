/* ============================================
   DRIVEPULSE – Sample Trip Data
   ============================================ */

const SAMPLE_TRIPS = [
    {
        id: 1,
        title: "Morning Commute",
        startLocation: "Connaught Place",
        endLocation: "Cyber Hub, Gurugram",
        date: "2026-03-14",
        startTime: "09:15 AM",
        endTime: "09:48 AM",
        distance: 12.4,
        duration: 33,
        avgSpeed: 45,
        maxSpeed: 78,
        accelerations: 5,
        brakings: 3,
        cornerings: 4,
        maxGForce: 1.2,
        stops: 6,
        score: 88,
        speedData: [0, 15, 32, 45, 52, 60, 55, 38, 0, 10, 35, 58, 72, 78, 65, 48, 52, 60, 45, 30, 0, 12, 40, 55, 62, 58, 45, 32, 18, 0],
        accelData: [0.1, 0.3, 0.5, 0.2, -0.4, -0.2, 0.1, 0.6, 0.3, -0.5, -0.3, 0.2, 0.4, 0.7, -0.3, 0.1, -0.6, 0.2, 0.3, -0.2, 0.5, 0.1, -0.4, 0.3, 0.2, -0.1, 0.4, -0.3, 0.1, 0],
        route: [
            [28.6315, 77.2167], [28.6280, 77.2130], [28.6220, 77.2080],
            [28.6150, 77.2010], [28.6080, 77.1940], [28.5990, 77.1860],
            [28.5900, 77.1780], [28.5810, 77.1700], [28.5720, 77.1620],
            [28.5630, 77.1540], [28.5540, 77.1460], [28.5450, 77.1380],
            [28.5360, 77.1310], [28.5280, 77.1250], [28.5200, 77.1190],
            [28.5120, 77.1100], [28.5050, 77.1020], [28.4980, 77.0940],
            [28.4920, 77.0880], [28.4860, 77.0820], [28.4810, 77.0770]
        ],
        scoreBreakdown: { speedControl: 90, smoothBraking: 85, cornering: 92, acceleration: 82 }
    },
    {
        id: 2,
        title: "Lunch Run",
        startLocation: "Cyber Hub",
        endLocation: "DLF Mall",
        date: "2026-03-14",
        startTime: "12:30 PM",
        endTime: "12:45 PM",
        distance: 3.2,
        duration: 15,
        avgSpeed: 28,
        maxSpeed: 52,
        accelerations: 2,
        brakings: 4,
        cornerings: 3,
        maxGForce: 0.8,
        stops: 4,
        score: 91,
        speedData: [0, 20, 35, 45, 52, 48, 30, 0, 15, 38, 42, 35, 22, 10, 0],
        accelData: [0.2, 0.4, 0.3, -0.2, -0.5, 0.1, 0.3, -0.3, 0.4, 0.2, -0.4, 0.1, -0.2, 0.1, 0],
        route: [
            [28.4810, 77.0770], [28.4790, 77.0750], [28.4770, 77.0730],
            [28.4750, 77.0700], [28.4730, 77.0680], [28.4710, 77.0660],
            [28.4690, 77.0640], [28.4680, 77.0620]
        ],
        scoreBreakdown: { speedControl: 94, smoothBraking: 88, cornering: 90, acceleration: 91 }
    },
    {
        id: 3,
        title: "Evening Return",
        startLocation: "Cyber Hub, Gurugram",
        endLocation: "Connaught Place",
        date: "2026-03-14",
        startTime: "06:30 PM",
        endTime: "07:22 PM",
        distance: 14.8,
        duration: 52,
        avgSpeed: 32,
        maxSpeed: 65,
        accelerations: 8,
        brakings: 7,
        cornerings: 5,
        maxGForce: 1.5,
        stops: 12,
        score: 79,
        speedData: [0, 10, 22, 35, 42, 30, 0, 8, 18, 30, 45, 55, 65, 58, 40, 25, 0, 12, 28, 42, 50, 38, 22, 0, 15, 32, 48, 55, 42, 30, 18, 0],
        accelData: [0.1, 0.5, 0.3, -0.6, -0.3, 0.2, 0.7, 0.3, -0.8, -0.2, 0.4, 0.6, -0.5, 0.1, -0.4, 0.3, 0.8, -0.3, 0.2, 0.5, -0.7, 0.1, -0.3, 0.4, 0.3, -0.2, 0.6, -0.5, 0.2, -0.1, 0.3, 0],
        route: [
            [28.4810, 77.0770], [28.4860, 77.0820], [28.4920, 77.0880],
            [28.4980, 77.0940], [28.5050, 77.1020], [28.5120, 77.1100],
            [28.5200, 77.1190], [28.5280, 77.1250], [28.5360, 77.1310],
            [28.5450, 77.1380], [28.5540, 77.1460], [28.5630, 77.1540],
            [28.5720, 77.1620], [28.5810, 77.1700], [28.5900, 77.1780],
            [28.5990, 77.1860], [28.6080, 77.1940], [28.6150, 77.2010],
            [28.6220, 77.2080], [28.6280, 77.2130], [28.6315, 77.2167]
        ],
        scoreBreakdown: { speedControl: 75, smoothBraking: 72, cornering: 85, acceleration: 80 }
    },
    {
        id: 4,
        title: "Weekend Drive",
        startLocation: "Hauz Khas",
        endLocation: "India Gate",
        date: "2026-03-13",
        startTime: "10:00 AM",
        endTime: "10:25 AM",
        distance: 8.6,
        duration: 25,
        avgSpeed: 38,
        maxSpeed: 62,
        accelerations: 3,
        brakings: 2,
        cornerings: 2,
        maxGForce: 0.9,
        stops: 3,
        score: 94,
        speedData: [0, 18, 35, 48, 55, 62, 58, 50, 42, 35, 28, 38, 48, 55, 45, 32, 20, 10, 0],
        accelData: [0.2, 0.3, 0.4, -0.2, 0.1, -0.3, 0.2, 0.1, -0.2, 0.3, 0.4, -0.1, 0.2, -0.3, 0.1, -0.2, 0.1, 0.1, 0],
        route: [
            [28.5494, 77.2001], [28.5520, 77.2050], [28.5560, 77.2100],
            [28.5600, 77.2150], [28.5640, 77.2200], [28.5680, 77.2250],
            [28.5720, 77.2300], [28.5750, 77.2340], [28.5780, 77.2380],
            [28.5810, 77.2410], [28.5840, 77.2440], [28.5870, 77.2470],
            [28.6130, 77.2295]
        ],
        scoreBreakdown: { speedControl: 96, smoothBraking: 93, cornering: 94, acceleration: 92 }
    },
    {
        id: 5,
        title: "Airport Drop",
        startLocation: "Vasant Kunj",
        endLocation: "IGI Airport T3",
        date: "2026-03-13",
        startTime: "04:00 AM",
        endTime: "04:20 AM",
        distance: 6.2,
        duration: 20,
        avgSpeed: 55,
        maxSpeed: 87,
        accelerations: 2,
        brakings: 1,
        cornerings: 2,
        maxGForce: 0.7,
        stops: 1,
        score: 96,
        speedData: [0, 25, 45, 60, 72, 80, 87, 85, 78, 70, 65, 72, 80, 75, 60, 42, 25, 10, 0],
        accelData: [0.3, 0.4, 0.3, 0.2, -0.1, 0.1, -0.2, 0.1, 0.2, -0.1, 0.2, 0.1, -0.2, -0.3, -0.2, -0.1, 0.1, 0, 0],
        route: [
            [28.5200, 77.1540], [28.5230, 77.1510], [28.5260, 77.1480],
            [28.5290, 77.1440], [28.5320, 77.1400], [28.5350, 77.1360],
            [28.5380, 77.1320], [28.5410, 77.1280], [28.5440, 77.1240],
            [28.5470, 77.1200], [28.5500, 77.1160], [28.5555, 77.1000]
        ],
        scoreBreakdown: { speedControl: 95, smoothBraking: 97, cornering: 96, acceleration: 95 }
    },
    {
        id: 6,
        title: "Market Visit",
        startLocation: "Sarojini Nagar",
        endLocation: "South Extension",
        date: "2026-03-12",
        startTime: "03:30 PM",
        endTime: "03:52 PM",
        distance: 5.1,
        duration: 22,
        avgSpeed: 30,
        maxSpeed: 48,
        accelerations: 4,
        brakings: 6,
        cornerings: 3,
        maxGForce: 1.0,
        stops: 8,
        score: 82,
        speedData: [0, 15, 28, 38, 48, 35, 0, 10, 25, 40, 45, 30, 0, 8, 22, 35, 42, 28, 12, 0],
        accelData: [0.2, 0.4, 0.3, -0.5, -0.3, 0.1, 0.5, 0.3, -0.4, -0.2, 0.3, 0.6, -0.5, 0.2, 0.4, -0.3, -0.4, 0.1, 0.2, 0],
        route: [
            [28.5744, 77.2000], [28.5720, 77.2030], [28.5700, 77.2060],
            [28.5680, 77.2090], [28.5660, 77.2120], [28.5640, 77.2150],
            [28.5620, 77.2180], [28.5600, 77.2210], [28.5580, 77.2240],
            [28.5760, 77.2220]
        ],
        scoreBreakdown: { speedControl: 80, smoothBraking: 78, cornering: 88, acceleration: 80 }
    },
    {
        id: 7,
        title: "Office Commute",
        startLocation: "Rajouri Garden",
        endLocation: "Nehru Place",
        date: "2026-03-12",
        startTime: "08:45 AM",
        endTime: "09:35 AM",
        distance: 18.3,
        duration: 50,
        avgSpeed: 35,
        maxSpeed: 72,
        accelerations: 10,
        brakings: 9,
        cornerings: 6,
        maxGForce: 1.4,
        stops: 14,
        score: 76,
        speedData: [0, 12, 28, 45, 55, 40, 0, 8, 22, 38, 52, 65, 72, 60, 42, 0, 10, 30, 48, 58, 45, 30, 0, 15, 35, 50, 42, 28, 12, 0],
        accelData: [0.1, 0.5, 0.6, -0.7, -0.4, 0.3, 0.8, 0.4, -0.6, -0.3, 0.5, 0.7, -0.5, 0.2, -0.8, 0.3, 0.6, -0.4, 0.2, 0.5, -0.6, 0.1, 0.7, -0.3, 0.4, -0.5, 0.2, -0.2, 0.1, 0],
        route: [
            [28.6490, 77.1230], [28.6450, 77.1280], [28.6400, 77.1340],
            [28.6350, 77.1400], [28.6310, 77.1470], [28.6270, 77.1540],
            [28.6230, 77.1610], [28.6190, 77.1680], [28.6150, 77.1750],
            [28.6100, 77.1830], [28.6050, 77.1900], [28.6000, 77.1970],
            [28.5950, 77.2040], [28.5900, 77.2100], [28.5850, 77.2160],
            [28.5800, 77.2230], [28.5750, 77.2290], [28.5700, 77.2350],
            [28.5680, 77.2400], [28.5660, 77.2450], [28.5640, 77.2480]
        ],
        scoreBreakdown: { speedControl: 72, smoothBraking: 70, cornering: 82, acceleration: 78 }
    },
    {
        id: 8,
        title: "Night Drive",
        startLocation: "India Gate",
        endLocation: "Lotus Temple",
        date: "2026-03-11",
        startTime: "10:30 PM",
        endTime: "10:52 PM",
        distance: 7.8,
        duration: 22,
        avgSpeed: 48,
        maxSpeed: 82,
        accelerations: 3,
        brakings: 2,
        cornerings: 3,
        maxGForce: 1.1,
        stops: 2,
        score: 90,
        speedData: [0, 22, 42, 58, 70, 82, 78, 65, 55, 48, 58, 68, 75, 62, 45, 30, 15, 0],
        accelData: [0.3, 0.5, 0.4, 0.2, -0.2, -0.1, 0.3, 0.2, -0.3, 0.1, 0.4, -0.2, 0.1, -0.4, -0.2, 0.1, 0, 0],
        route: [
            [28.6130, 77.2295], [28.6100, 77.2320], [28.6060, 77.2350],
            [28.6020, 77.2380], [28.5980, 77.2410], [28.5940, 77.2440],
            [28.5900, 77.2460], [28.5860, 77.2480], [28.5820, 77.2500],
            [28.5780, 77.2520], [28.5740, 77.2540], [28.5700, 77.2560],
            [28.5535, 77.2588]
        ],
        scoreBreakdown: { speedControl: 92, smoothBraking: 90, cornering: 88, acceleration: 89 }
    }
];

// Weekly distance data
const WEEKLY_DISTANCE = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    data: [22.4, 18.6, 25.1, 14.8, 28.3, 12.0, 6.2]
};

// Speed distribution data
const SPEED_DISTRIBUTION = {
    labels: ['0-20', '20-40', '40-60', '60-80', '80-100', '100+'],
    data: [15, 30, 28, 18, 8, 1]
};

// Weekly score trend
const SCORE_TREND = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    data: [82, 85, 79, 88, 76, 94, 90]
};
