"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { feature } from "topojson-client";

type GlobeSelection = { label: string; latitude: number; longitude: number };
type InteractiveGlobeProps = { location: string; reducedMotion: boolean | null; onSelectCountry: (selection: GlobeSelection) => void };

type Topology = { objects: Record<string, unknown> };
type CountryFeature = { geometry?: { type: string; coordinates: unknown }; properties?: { name?: string } };
type CityMarker = { name: string; longitude: number; latitude: number; country?: string };
const MIN_ZOOM = 2.2;
const MAX_ZOOM = 7.6;

const CITY_MARKERS: CityMarker[] = [
  { name: "New York", longitude: -74.006, latitude: 40.7128 },
  { name: "Paris", longitude: 2.3522, latitude: 48.8566 },
  { name: "London", longitude: -0.1276, latitude: 51.5072 },
  { name: "Tokyo", longitude: 139.6917, latitude: 35.6895 },
  { name: "Los Angeles", longitude: -118.2437, latitude: 34.0522 },
  { name: "Chicago", longitude: -87.6298, latitude: 41.8781 },
  { name: "San Francisco", longitude: -122.4194, latitude: 37.7749 },
  { name: "Miami", longitude: -80.1918, latitude: 25.7617 },
  { name: "Seattle", longitude: -122.3321, latitude: 47.6062 },
  { name: "Boston", longitude: -71.0589, latitude: 42.3601 },
  { name: "Houston", longitude: -95.3698, latitude: 29.7604 },
  { name: "Las Vegas", longitude: -115.1398, latitude: 36.1699 },
  { name: "Toronto", longitude: -79.3832, latitude: 43.6532 },
  { name: "Vancouver", longitude: -123.1207, latitude: 49.2827 },
  { name: "Montreal", longitude: -73.5673, latitude: 45.5017 },
  { name: "Mexico City", longitude: -99.1332, latitude: 19.4326 },
  { name: "Guadalajara", longitude: -103.3496, latitude: 20.6597 },
  { name: "Cancun", longitude: -86.8515, latitude: 21.1619 },
  { name: "Sao Paulo", longitude: -46.6333, latitude: -23.5505 },
  { name: "Rio", longitude: -43.1729, latitude: -22.9068 },
  { name: "Buenos Aires", longitude: -58.3816, latitude: -34.6037 },
  { name: "Lima", longitude: -77.0428, latitude: -12.0464 },
  { name: "Bogota", longitude: -74.0721, latitude: 4.711 },
  { name: "Santiago", longitude: -70.6693, latitude: -33.4489 },
  { name: "Asuncion", country: "Paraguay", longitude: -57.5759, latitude: -25.2637 },
  { name: "Rome", longitude: 12.4964, latitude: 41.9028 },
  { name: "Milan", longitude: 9.19, latitude: 45.4642 },
  { name: "Venice", longitude: 12.3155, latitude: 45.4408 },
  { name: "Madrid", longitude: -3.7038, latitude: 40.4168 },
  { name: "Barcelona", longitude: 2.1734, latitude: 41.3851 },
  { name: "Lisbon", longitude: -9.1393, latitude: 38.7223 },
  { name: "Berlin", longitude: 13.405, latitude: 52.52 },
  { name: "Munich", longitude: 11.582, latitude: 48.1351 },
  { name: "Amsterdam", longitude: 4.9041, latitude: 52.3676 },
  { name: "Brussels", longitude: 4.3517, latitude: 50.8503 },
  { name: "Zurich", longitude: 8.5417, latitude: 47.3769 },
  { name: "Vienna", longitude: 16.3738, latitude: 48.2082 },
  { name: "Prague", longitude: 14.4378, latitude: 50.0755 },
  { name: "Copenhagen", longitude: 12.5683, latitude: 55.6761 },
  { name: "Stockholm", longitude: 18.0686, latitude: 59.3293 },
  { name: "Oslo", longitude: 10.7522, latitude: 59.9139 },
  { name: "Dublin", longitude: -6.2603, latitude: 53.3498 },
  { name: "Edinburgh", longitude: -3.1883, latitude: 55.9533 },
  { name: "Istanbul", longitude: 28.9784, latitude: 41.0082 },
  { name: "Athens", longitude: 23.7275, latitude: 37.9838 },
  { name: "Warsaw", longitude: 21.0122, latitude: 52.2297 },
  { name: "Budapest", longitude: 19.0402, latitude: 47.4979 },
  { name: "Moscow", longitude: 37.6173, latitude: 55.7558 },
  { name: "St Petersburg", longitude: 30.3351, latitude: 59.9343 },
  { name: "Minsk", country: "Belarus", longitude: 27.5615, latitude: 53.9045 },
  { name: "Chisinau", country: "Moldova", longitude: 28.8638, latitude: 47.0105 },
  { name: "Tirana", country: "Albania", longitude: 19.8187, latitude: 41.3275 },
  { name: "Luxembourg", country: "Luxembourg", longitude: 6.1296, latitude: 49.6116 },
  { name: "Cairo", longitude: 31.2357, latitude: 30.0444 },
  { name: "Casablanca", longitude: -7.5898, latitude: 33.5731 },
  { name: "Marrakesh", longitude: -7.9811, latitude: 31.6295 },
  { name: "Cape Town", longitude: 18.4241, latitude: -33.9249 },
  { name: "Johannesburg", longitude: 28.0473, latitude: -26.2041 },
  { name: "Lagos", longitude: 3.3792, latitude: 6.5244 },
  { name: "Nairobi", longitude: 36.8219, latitude: -1.2921 },
  { name: "Accra", longitude: -0.187, latitude: 5.6037 },
  { name: "Addis Ababa", longitude: 38.7578, latitude: 8.9806 },
  { name: "Dubai", longitude: 55.2708, latitude: 25.2048 },
  { name: "Abu Dhabi", longitude: 54.3773, latitude: 24.4539 },
  { name: "Doha", longitude: 51.531, latitude: 25.2854 },
  { name: "Kuwait City", country: "Kuwait", longitude: 47.9783, latitude: 29.3759 },
  { name: "Manama", country: "Bahrain", longitude: 50.586, latitude: 26.2285 },
  { name: "Muscat", country: "Oman", longitude: 58.4059, latitude: 23.588 },
  { name: "Salalah", country: "Oman", longitude: 54.0924, latitude: 17.0194 },
  { name: "Tel Aviv", longitude: 34.7818, latitude: 32.0853 },
  { name: "Jerusalem", country: "Israel", longitude: 35.2137, latitude: 31.7683 },
  { name: "Haifa", country: "Israel", longitude: 34.9896, latitude: 32.794 },
  { name: "Ramallah", country: "Palestine", longitude: 35.2034, latitude: 31.9038 },
  { name: "Amman", country: "Jordan", longitude: 35.9106, latitude: 31.9539 },
  { name: "Aqaba", country: "Jordan", longitude: 35.0063, latitude: 29.5321 },
  { name: "Beirut", country: "Lebanon", longitude: 35.5018, latitude: 33.8938 },
  { name: "Damascus", country: "Syria", longitude: 36.2765, latitude: 33.5138 },
  { name: "Aleppo", country: "Syria", longitude: 37.1343, latitude: 36.2021 },
  { name: "Baghdad", country: "Iraq", longitude: 44.3661, latitude: 33.3152 },
  { name: "Basra", country: "Iraq", longitude: 47.7835, latitude: 30.5085 },
  { name: "Erbil", country: "Iraq", longitude: 44.0092, latitude: 36.1911 },
  { name: "Tehran", country: "Iran", longitude: 51.389, latitude: 35.6892 },
  { name: "Mashhad", country: "Iran", longitude: 59.6168, latitude: 36.2605 },
  { name: "Isfahan", country: "Iran", longitude: 51.6776, latitude: 32.6539 },
  { name: "Shiraz", country: "Iran", longitude: 52.5837, latitude: 29.5918 },
  { name: "Tabriz", country: "Iran", longitude: 46.2919, latitude: 38.0962 },
  { name: "Riyadh", longitude: 46.6753, latitude: 24.7136 },
  { name: "Jeddah", longitude: 39.1925, latitude: 21.4858 },
  { name: "Mecca", country: "Saudi Arabia", longitude: 39.8579, latitude: 21.3891 },
  { name: "Medina", country: "Saudi Arabia", longitude: 39.5692, latitude: 24.5247 },
  { name: "Sanaa", country: "Yemen", longitude: 44.2067, latitude: 15.3694 },
  { name: "Aden", country: "Yemen", longitude: 45.0187, latitude: 12.7855 },
  { name: "Ankara", country: "Turkey", longitude: 32.8597, latitude: 39.9334 },
  { name: "Izmir", country: "Turkey", longitude: 27.1428, latitude: 38.4237 },
  { name: "Antalya", country: "Turkey", longitude: 30.7133, latitude: 36.8969 },
  { name: "Gaziantep", country: "Turkey", longitude: 37.3833, latitude: 37.0662 },
  { name: "Kabul", country: "Afghanistan", longitude: 69.2075, latitude: 34.5553 },
  { name: "Astana", country: "Kazakhstan", longitude: 71.4304, latitude: 51.1282 },
  { name: "Almaty", country: "Kazakhstan", longitude: 76.9286, latitude: 43.222 },
  { name: "Tashkent", country: "Uzbekistan", longitude: 69.2401, latitude: 41.2995 },
  { name: "Dushanbe", country: "Tajikistan", longitude: 68.787, latitude: 38.5598 },
  { name: "Bishkek", country: "Kyrgyzstan", longitude: 74.5698, latitude: 42.8746 },
  { name: "Ashgabat", country: "Turkmenistan", longitude: 58.3838, latitude: 37.9601 },
  { name: "Yerevan", country: "Armenia", longitude: 44.5152, latitude: 40.1872 },
  { name: "Baku", country: "Azerbaijan", longitude: 49.8671, latitude: 40.4093 },
  { name: "Tbilisi", country: "Georgia", longitude: 44.8271, latitude: 41.7151 },
  { name: "Mumbai", longitude: 72.8777, latitude: 19.076 },
  { name: "Delhi", longitude: 77.1025, latitude: 28.7041 },
  { name: "Bengaluru", longitude: 77.5946, latitude: 12.9716 },
  { name: "Chennai", longitude: 80.2707, latitude: 13.0827 },
  { name: "Kolkata", longitude: 88.3639, latitude: 22.5726 },
  { name: "Kathmandu", country: "Nepal", longitude: 85.324, latitude: 27.7172 },
  { name: "Thimphu", country: "Bhutan", longitude: 89.639, latitude: 27.4728 },
  { name: "Colombo", country: "Sri Lanka", longitude: 79.8612, latitude: 6.9271 },
  { name: "Karachi", longitude: 67.0011, latitude: 24.8607 },
  { name: "Lahore", longitude: 74.3587, latitude: 31.5204 },
  { name: "Dhaka", longitude: 90.4125, latitude: 23.8103 },
  { name: "Bangkok", longitude: 100.5018, latitude: 13.7563 },
  { name: "Phuket", longitude: 98.3923, latitude: 7.8804 },
  { name: "Hanoi", longitude: 105.8342, latitude: 21.0278 },
  { name: "Ho Chi Minh", longitude: 106.6297, latitude: 10.8231 },
  { name: "Kuala Lumpur", longitude: 101.6869, latitude: 3.139 },
  { name: "Singapore", longitude: 103.8198, latitude: 1.3521 },
  { name: "Jakarta", longitude: 106.8456, latitude: -6.2088 },
  { name: "Bali", longitude: 115.1889, latitude: -8.4095 },
  { name: "Manila", longitude: 120.9842, latitude: 14.5995 },
  { name: "Hong Kong", longitude: 114.1694, latitude: 22.3193 },
  { name: "Shanghai", longitude: 121.4737, latitude: 31.2304 },
  { name: "Beijing", longitude: 116.4074, latitude: 39.9042 },
  { name: "Shenzhen", longitude: 114.0579, latitude: 22.5431 },
  { name: "Seoul", longitude: 126.978, latitude: 37.5665 },
  { name: "Pyongyang", country: "North Korea", longitude: 125.7625, latitude: 39.0392 },
  { name: "Ulaanbaatar", country: "Mongolia", longitude: 106.9057, latitude: 47.8864 },
  { name: "Osaka", longitude: 135.5023, latitude: 34.6937 },
  { name: "Kyoto", longitude: 135.7681, latitude: 35.0116 },
  { name: "Taipei", longitude: 121.5654, latitude: 25.033 },
  { name: "Vientiane", country: "Laos", longitude: 102.6331, latitude: 17.9757 },
  { name: "Luang Prabang", country: "Laos", longitude: 102.135, latitude: 19.8833 },
  { name: "Pakse", country: "Laos", longitude: 105.8206, latitude: 15.1202 },
  { name: "Savannakhet", country: "Laos", longitude: 104.75, latitude: 16.55 },
  { name: "Phnom Penh", country: "Cambodia", longitude: 104.9282, latitude: 11.5564 },
  { name: "Siem Reap", country: "Cambodia", longitude: 103.8564, latitude: 13.3633 },
  { name: "Yangon", country: "Myanmar", longitude: 96.1951, latitude: 16.8661 },
  { name: "Mandalay", country: "Myanmar", longitude: 96.0891, latitude: 21.9588 },
  { name: "Naypyidaw", country: "Myanmar", longitude: 96.0785, latitude: 19.7633 },
  { name: "Bandar Seri Begawan", country: "Brunei", longitude: 114.9398, latitude: 4.9031 },
  { name: "Dili", country: "Timor-Leste", longitude: 125.5603, latitude: -8.5569 },
  { name: "Sydney", longitude: 151.2093, latitude: -33.8688 },
  { name: "Melbourne", longitude: 144.9631, latitude: -37.8136 },
  { name: "Brisbane", longitude: 153.0251, latitude: -27.4698 },
  { name: "Perth", longitude: 115.8605, latitude: -31.9505 },
  { name: "Port Moresby", country: "Papua New Guinea", longitude: 147.1803, latitude: -9.4438 },
  { name: "Suva", country: "Fiji", longitude: 178.4419, latitude: -18.1248 },
  { name: "Port Vila", country: "Vanuatu", longitude: 168.3273, latitude: -17.7333 },
  { name: "Honiara", country: "Solomon Islands", longitude: 159.9729, latitude: -9.4456 },
  { name: "Noumea", country: "New Caledonia", longitude: 166.4572, latitude: -22.2758 },
  { name: "Auckland", longitude: 174.7633, latitude: -36.8485 },
  { name: "Atlanta", country: "United States", longitude: -84.388, latitude: 33.749 },
  { name: "Dallas", country: "United States", longitude: -96.797, latitude: 32.7767 },
  { name: "Austin", country: "United States", longitude: -97.7431, latitude: 30.2672 },
  { name: "Denver", country: "United States", longitude: -104.9903, latitude: 39.7392 },
  { name: "Phoenix", country: "United States", longitude: -112.074, latitude: 33.4484 },
  { name: "San Diego", country: "United States", longitude: -117.1611, latitude: 32.7157 },
  { name: "Portland", country: "United States", longitude: -122.6784, latitude: 45.5152 },
  { name: "Nashville", country: "United States", longitude: -86.7816, latitude: 36.1627 },
  { name: "New Orleans", country: "United States", longitude: -90.0715, latitude: 29.9511 },
  { name: "Philadelphia", country: "United States", longitude: -75.1652, latitude: 39.9526 },
  { name: "Washington", country: "United States", longitude: -77.0369, latitude: 38.9072 },
  { name: "Orlando", country: "United States", longitude: -81.3792, latitude: 28.5383 },
  { name: "Charlotte", country: "United States", longitude: -80.8431, latitude: 35.2271 },
  { name: "Minneapolis", country: "United States", longitude: -93.265, latitude: 44.9778 },
  { name: "Calgary", country: "Canada", longitude: -114.0719, latitude: 51.0447 },
  { name: "Ottawa", country: "Canada", longitude: -75.6972, latitude: 45.4215 },
  { name: "Edmonton", country: "Canada", longitude: -113.4938, latitude: 53.5461 },
  { name: "Quebec City", country: "Canada", longitude: -71.208, latitude: 46.8139 },
  { name: "Monterrey", country: "Mexico", longitude: -100.3161, latitude: 25.6866 },
  { name: "Tijuana", country: "Mexico", longitude: -117.0382, latitude: 32.5149 },
  { name: "Puebla", country: "Mexico", longitude: -98.2063, latitude: 19.0414 },
  { name: "Havana", country: "Cuba", longitude: -82.3666, latitude: 23.1136 },
  { name: "Port-au-Prince", country: "Haiti", longitude: -72.3074, latitude: 18.5944 },
  { name: "Santo Domingo", country: "Dominican Republic", longitude: -69.9312, latitude: 18.4861 },
  { name: "Nassau", country: "Bahamas", longitude: -77.3963, latitude: 25.0343 },
  { name: "Kingston", country: "Jamaica", longitude: -76.792, latitude: 17.9712 },
  { name: "Port of Spain", country: "Trinidad and Tobago", longitude: -61.5189, latitude: 10.6549 },
  { name: "San Juan", country: "Puerto Rico", longitude: -66.1057, latitude: 18.4655 },
  { name: "Panama City", country: "Panama", longitude: -79.5199, latitude: 8.9824 },
  { name: "San Jose", country: "Costa Rica", longitude: -84.0907, latitude: 9.9281 },
  { name: "Guatemala City", country: "Guatemala", longitude: -90.5069, latitude: 14.6349 },
  { name: "Managua", country: "Nicaragua", longitude: -86.2514, latitude: 12.114 },
  { name: "Tegucigalpa", country: "Honduras", longitude: -87.2068, latitude: 14.0723 },
  { name: "San Salvador", country: "El Salvador", longitude: -89.2182, latitude: 13.6929 },
  { name: "Belize City", country: "Belize", longitude: -88.1962, latitude: 17.5046 },
  { name: "Medellin", country: "Colombia", longitude: -75.5812, latitude: 6.2442 },
  { name: "Cartagena", country: "Colombia", longitude: -75.4794, latitude: 10.391 },
  { name: "Quito", country: "Ecuador", longitude: -78.4678, latitude: -0.1807 },
  { name: "Guayaquil", country: "Ecuador", longitude: -79.8891, latitude: -2.1894 },
  { name: "La Paz", country: "Bolivia", longitude: -68.1193, latitude: -16.4897 },
  { name: "Georgetown", country: "Guyana", longitude: -58.1551, latitude: 6.8013 },
  { name: "Paramaribo", country: "Suriname", longitude: -55.2038, latitude: 5.852 },
  { name: "Montevideo", country: "Uruguay", longitude: -56.1645, latitude: -34.9011 },
  { name: "Caracas", country: "Venezuela", longitude: -66.9036, latitude: 10.4806 },
  { name: "Maracaibo", country: "Venezuela", longitude: -71.6406, latitude: 10.6545 },
  { name: "Valencia", country: "Venezuela", longitude: -68.0077, latitude: 10.162 },
  { name: "Barquisimeto", country: "Venezuela", longitude: -69.3228, latitude: 10.0678 },
  { name: "Maracay", country: "Venezuela", longitude: -67.5911, latitude: 10.2469 },
  { name: "Ciudad Guayana", country: "Venezuela", longitude: -62.6528, latitude: 8.3512 },
  { name: "Maturin", country: "Venezuela", longitude: -63.1767, latitude: 9.75 },
  { name: "Merida", country: "Venezuela", longitude: -71.1448, latitude: 8.5897 },
  { name: "San Cristobal", country: "Venezuela", longitude: -72.225, latitude: 7.7669 },
  { name: "Puerto La Cruz", country: "Venezuela", longitude: -64.6333, latitude: 10.2167 },
  { name: "Porlamar", country: "Venezuela", longitude: -63.8491, latitude: 10.9577 },
  { name: "Cumana", country: "Venezuela", longitude: -64.181, latitude: 10.4635 },
  { name: "Barinas", country: "Venezuela", longitude: -70.2261, latitude: 8.6226 },
  { name: "Ciudad Bolivar", country: "Venezuela", longitude: -63.5497, latitude: 8.1222 },
  { name: "Cordoba", country: "Argentina", longitude: -64.1888, latitude: -31.4201 },
  { name: "Rosario", country: "Argentina", longitude: -60.6393, latitude: -32.9442 },
  { name: "Brasilia", country: "Brazil", longitude: -47.8825, latitude: -15.7942 },
  { name: "Salvador", country: "Brazil", longitude: -38.5014, latitude: -12.9777 },
  { name: "Fortaleza", country: "Brazil", longitude: -38.5267, latitude: -3.7319 },
  { name: "Recife", country: "Brazil", longitude: -34.877, latitude: -8.0476 },
  { name: "Porto Alegre", country: "Brazil", longitude: -51.2177, latitude: -30.0346 },
  { name: "Belo Horizonte", country: "Brazil", longitude: -43.9386, latitude: -19.9167 },
  { name: "Curitiba", country: "Brazil", longitude: -49.2733, latitude: -25.4284 },
  { name: "Algiers", country: "Algeria", longitude: 3.0588, latitude: 36.7538 },
  { name: "Oran", country: "Algeria", longitude: -0.6337, latitude: 35.6971 },
  { name: "Tunis", country: "Tunisia", longitude: 10.1815, latitude: 36.8065 },
  { name: "Tripoli", country: "Libya", longitude: 13.1913, latitude: 32.8872 },
  { name: "Alexandria", country: "Egypt", longitude: 29.9187, latitude: 31.2001 },
  { name: "Giza", country: "Egypt", longitude: 31.2089, latitude: 30.0131 },
  { name: "Khartoum", country: "Sudan", longitude: 32.5599, latitude: 15.5007 },
  { name: "Port Sudan", country: "Sudan", longitude: 37.2164, latitude: 19.6158 },
  { name: "Dakar", country: "Senegal", longitude: -17.4677, latitude: 14.7167 },
  { name: "Nouakchott", country: "Mauritania", longitude: -15.9785, latitude: 18.0735 },
  { name: "Nouadhibou", country: "Mauritania", longitude: -17.0347, latitude: 20.9425 },
  { name: "Rosso", country: "Mauritania", longitude: -15.808, latitude: 16.5138 },
  { name: "Atar", country: "Mauritania", longitude: -13.0499, latitude: 20.5169 },
  { name: "Bamako", country: "Mali", longitude: -8.0029, latitude: 12.6392 },
  { name: "Timbuktu", country: "Mali", longitude: -3.0074, latitude: 16.7666 },
  { name: "Ouagadougou", country: "Burkina Faso", longitude: -1.5197, latitude: 12.3714 },
  { name: "Bobo-Dioulasso", country: "Burkina Faso", longitude: -4.2979, latitude: 11.1784 },
  { name: "Niamey", country: "Niger", longitude: 2.1254, latitude: 13.5116 },
  { name: "Agadez", country: "Niger", longitude: 7.9911, latitude: 16.9733 },
  { name: "N'Djamena", country: "Chad", longitude: 15.0557, latitude: 12.1348 },
  { name: "Moundou", country: "Chad", longitude: 16.0856, latitude: 8.5667 },
  { name: "Banjul", country: "Gambia", longitude: -16.578, latitude: 13.4549 },
  { name: "Conakry", country: "Guinea", longitude: -13.5784, latitude: 9.6412 },
  { name: "Bissau", country: "Guinea-Bissau", longitude: -15.5977, latitude: 11.8817 },
  { name: "Freetown", country: "Sierra Leone", longitude: -13.2317, latitude: 8.4657 },
  { name: "Monrovia", country: "Liberia", longitude: -10.7978, latitude: 6.3156 },
  { name: "Abidjan", country: "Cote d'Ivoire", longitude: -4.0083, latitude: 5.36 },
  { name: "Yamoussoukro", country: "Cote d'Ivoire", longitude: -5.2767, latitude: 6.8276 },
  { name: "Kumasi", country: "Ghana", longitude: -1.6163, latitude: 6.6666 },
  { name: "Cotonou", country: "Benin", longitude: 2.4183, latitude: 6.3703 },
  { name: "Porto-Novo", country: "Benin", longitude: 2.6323, latitude: 6.4969 },
  { name: "Lome", country: "Togo", longitude: 1.2314, latitude: 6.1725 },
  { name: "Abuja", country: "Nigeria", longitude: 7.3986, latitude: 9.0765 },
  { name: "Kano", country: "Nigeria", longitude: 8.5167, latitude: 12.0022 },
  { name: "Ibadan", country: "Nigeria", longitude: 3.947, latitude: 7.3775 },
  { name: "Douala", country: "Cameroon", longitude: 9.7085, latitude: 4.0511 },
  { name: "Yaounde", country: "Cameroon", longitude: 11.5021, latitude: 3.848 },
  { name: "Bangui", country: "Central African Republic", longitude: 18.5582, latitude: 4.3947 },
  { name: "Libreville", country: "Gabon", longitude: 9.4673, latitude: 0.4162 },
  { name: "Port-Gentil", country: "Gabon", longitude: 8.7815, latitude: -0.7351 },
  { name: "Malabo", country: "Equatorial Guinea", longitude: 8.7833, latitude: 3.75 },
  { name: "Bata", country: "Equatorial Guinea", longitude: 9.7679, latitude: 1.8639 },
  { name: "Kinshasa", country: "DR Congo", longitude: 15.2663, latitude: -4.4419 },
  { name: "Lubumbashi", country: "DR Congo", longitude: 27.4794, latitude: -11.6876 },
  { name: "Brazzaville", country: "Congo", longitude: 15.2663, latitude: -4.2634 },
  { name: "Pointe-Noire", country: "Congo", longitude: 11.8635, latitude: -4.7692 },
  { name: "Luanda", country: "Angola", longitude: 13.2344, latitude: -8.839 },
  { name: "Huambo", country: "Angola", longitude: 15.7392, latitude: -12.7761 },
  { name: "Kigali", country: "Rwanda", longitude: 30.0619, latitude: -1.9441 },
  { name: "Bujumbura", country: "Burundi", longitude: 29.3639, latitude: -3.3614 },
  { name: "Kampala", country: "Uganda", longitude: 32.5825, latitude: 0.3476 },
  { name: "Juba", country: "South Sudan", longitude: 31.5825, latitude: 4.8594 },
  { name: "Asmara", country: "Eritrea", longitude: 38.9251, latitude: 15.3229 },
  { name: "Djibouti", country: "Djibouti", longitude: 43.1456, latitude: 11.5721 },
  { name: "Hargeisa", country: "Somaliland", longitude: 44.064, latitude: 9.56 },
  { name: "Mogadishu", country: "Somalia", longitude: 45.3182, latitude: 2.0469 },
  { name: "Dar es Salaam", country: "Tanzania", longitude: 39.2083, latitude: -6.7924 },
  { name: "Dodoma", country: "Tanzania", longitude: 35.7516, latitude: -6.163 },
  { name: "Addis Ababa", country: "Ethiopia", longitude: 38.7578, latitude: 8.9806 },
  { name: "Mombasa", country: "Kenya", longitude: 39.6682, latitude: -4.0435 },
  { name: "Maputo", country: "Mozambique", longitude: 32.5732, latitude: -25.9692 },
  { name: "Beira", country: "Mozambique", longitude: 34.8389, latitude: -19.8333 },
  { name: "Antananarivo", country: "Madagascar", longitude: 47.5079, latitude: -18.8792 },
  { name: "Toamasina", country: "Madagascar", longitude: 49.4023, latitude: -18.1492 },
  { name: "Lilongwe", country: "Malawi", longitude: 33.7873, latitude: -13.9626 },
  { name: "Blantyre", country: "Malawi", longitude: 35.0058, latitude: -15.7861 },
  { name: "Harare", country: "Zimbabwe", longitude: 31.053, latitude: -17.8292 },
  { name: "Bulawayo", country: "Zimbabwe", longitude: 28.6265, latitude: -20.1325 },
  { name: "Lusaka", country: "Zambia", longitude: 28.3228, latitude: -15.3875 },
  { name: "Ndola", country: "Zambia", longitude: 28.6366, latitude: -12.9587 },
  { name: "Gaborone", country: "Botswana", longitude: 25.9231, latitude: -24.6282 },
  { name: "Francistown", country: "Botswana", longitude: 27.5079, latitude: -21.17 },
  { name: "Windhoek", country: "Namibia", longitude: 17.0832, latitude: -22.5609 },
  { name: "Walvis Bay", country: "Namibia", longitude: 14.5053, latitude: -22.9576 },
  { name: "Maseru", country: "Lesotho", longitude: 27.4782, latitude: -29.3158 },
  { name: "Mbabane", country: "eSwatini", longitude: 31.1367, latitude: -26.3054 },
  { name: "Durban", country: "South Africa", longitude: 31.0218, latitude: -29.8587 },
  { name: "Pretoria", country: "South Africa", longitude: 28.1881, latitude: -25.7479 },
  { name: "Port Elizabeth", country: "South Africa", longitude: 25.6022, latitude: -33.9608 },
  { name: "Beijing", country: "China", longitude: 116.4074, latitude: 39.9042 },
  { name: "Guangzhou", country: "China", longitude: 113.2644, latitude: 23.1291 },
  { name: "Chengdu", country: "China", longitude: 104.0668, latitude: 30.5728 },
  { name: "Chongqing", country: "China", longitude: 106.5516, latitude: 29.563 },
  { name: "Wuhan", country: "China", longitude: 114.3054, latitude: 30.5928 },
  { name: "Xi'an", country: "China", longitude: 108.9398, latitude: 34.3416 },
  { name: "Hangzhou", country: "China", longitude: 120.1551, latitude: 30.2741 },
  { name: "Nanjing", country: "China", longitude: 118.7969, latitude: 32.0603 },
  { name: "Tianjin", country: "China", longitude: 117.3616, latitude: 39.3434 },
  { name: "Suzhou", country: "China", longitude: 120.5853, latitude: 31.2989 },
  { name: "Qingdao", country: "China", longitude: 120.3826, latitude: 36.0671 },
  { name: "Dalian", country: "China", longitude: 121.6147, latitude: 38.914 },
  { name: "Xiamen", country: "China", longitude: 118.0894, latitude: 24.4798 },
  { name: "Kunming", country: "China", longitude: 102.8329, latitude: 24.8801 },
  { name: "Changsha", country: "China", longitude: 112.9388, latitude: 28.2282 },
  { name: "Shenyang", country: "China", longitude: 123.4315, latitude: 41.8057 },
  { name: "Harbin", country: "China", longitude: 126.6424, latitude: 45.7567 },
  { name: "Zhengzhou", country: "China", longitude: 113.6254, latitude: 34.7466 },
  { name: "Jinan", country: "China", longitude: 117.1201, latitude: 36.6512 },
  { name: "Fuzhou", country: "China", longitude: 119.2965, latitude: 26.0745 },
  { name: "Ningbo", country: "China", longitude: 121.5503, latitude: 29.8746 },
  { name: "Macau", country: "China", longitude: 113.5439, latitude: 22.1987 },
  { name: "Manchester", country: "United Kingdom", longitude: -2.2426, latitude: 53.4808 },
  { name: "Birmingham", country: "United Kingdom", longitude: -1.8904, latitude: 52.4862 },
  { name: "Liverpool", country: "United Kingdom", longitude: -2.9916, latitude: 53.4084 },
  { name: "Glasgow", country: "United Kingdom", longitude: -4.2518, latitude: 55.8642 },
  { name: "Nice", country: "France", longitude: 7.262, latitude: 43.7102 },
  { name: "Lyon", country: "France", longitude: 4.8357, latitude: 45.764 },
  { name: "Marseille", country: "France", longitude: 5.3698, latitude: 43.2965 },
  { name: "Bordeaux", country: "France", longitude: -0.5792, latitude: 44.8378 },
  { name: "Toulouse", country: "France", longitude: 1.4442, latitude: 43.6047 },
  { name: "Hamburg", country: "Germany", longitude: 9.9937, latitude: 53.5511 },
  { name: "Frankfurt", country: "Germany", longitude: 8.6821, latitude: 50.1109 },
  { name: "Cologne", country: "Germany", longitude: 6.9603, latitude: 50.9375 },
  { name: "Dusseldorf", country: "Germany", longitude: 6.7735, latitude: 51.2277 },
  { name: "Stuttgart", country: "Germany", longitude: 9.1829, latitude: 48.7758 },
  { name: "Florence", country: "Italy", longitude: 11.2558, latitude: 43.7696 },
  { name: "Naples", country: "Italy", longitude: 14.2681, latitude: 40.8518 },
  { name: "Turin", country: "Italy", longitude: 7.6869, latitude: 45.0703 },
  { name: "Bologna", country: "Italy", longitude: 11.3426, latitude: 44.4949 },
  { name: "Seville", country: "Spain", longitude: -5.9845, latitude: 37.3891 },
  { name: "Valencia", country: "Spain", longitude: -0.3763, latitude: 39.4699 },
  { name: "Bilbao", country: "Spain", longitude: -2.935, latitude: 43.263 },
  { name: "Porto", country: "Portugal", longitude: -8.6291, latitude: 41.1579 },
  { name: "Rotterdam", country: "Netherlands", longitude: 4.4777, latitude: 51.9244 },
  { name: "The Hague", country: "Netherlands", longitude: 4.3007, latitude: 52.0705 },
  { name: "Antwerp", country: "Belgium", longitude: 4.4025, latitude: 51.2194 },
  { name: "Geneva", country: "Switzerland", longitude: 6.1432, latitude: 46.2044 },
  { name: "Basel", country: "Switzerland", longitude: 7.5886, latitude: 47.5596 },
  { name: "Graz", country: "Austria", longitude: 15.4395, latitude: 47.0707 },
  { name: "Salzburg", country: "Austria", longitude: 13.055, latitude: 47.8095 },
  { name: "Linz", country: "Austria", longitude: 14.2858, latitude: 48.3069 },
  { name: "Innsbruck", country: "Austria", longitude: 11.4041, latitude: 47.2692 },
  { name: "Krakow", country: "Poland", longitude: 19.945, latitude: 50.0647 },
  { name: "Gdansk", country: "Poland", longitude: 18.6466, latitude: 54.352 },
  { name: "Brno", country: "Czechia", longitude: 16.6068, latitude: 49.1951 },
  { name: "Bratislava", country: "Slovakia", longitude: 17.1077, latitude: 48.1486 },
  { name: "Ljubljana", country: "Slovenia", longitude: 14.5058, latitude: 46.0569 },
  { name: "Zagreb", country: "Croatia", longitude: 15.9819, latitude: 45.815 },
  { name: "Split", country: "Croatia", longitude: 16.4402, latitude: 43.5081 },
  { name: "Sarajevo", country: "Bosnia and Herzegovina", longitude: 18.4131, latitude: 43.8563 },
  { name: "Belgrade", country: "Serbia", longitude: 20.4489, latitude: 44.7866 },
  { name: "Skopje", country: "Macedonia", longitude: 21.4316, latitude: 41.9981 },
  { name: "Podgorica", country: "Montenegro", longitude: 19.2594, latitude: 42.4304 },
  { name: "Pristina", country: "Kosovo", longitude: 21.1655, latitude: 42.6629 },
  { name: "Sofia", country: "Bulgaria", longitude: 23.3219, latitude: 42.6977 },
  { name: "Bucharest", country: "Romania", longitude: 26.1025, latitude: 44.4268 },
  { name: "Cluj-Napoca", country: "Romania", longitude: 23.5899, latitude: 46.7712 },
  { name: "Thessaloniki", country: "Greece", longitude: 22.9444, latitude: 40.6401 },
  { name: "Helsinki", country: "Finland", longitude: 24.9384, latitude: 60.1699 },
  { name: "Reykjavik", country: "Iceland", longitude: -21.8278, latitude: 64.1265 },
  { name: "Nuuk", country: "Greenland", longitude: -51.7216, latitude: 64.1835 },
  { name: "Stanley", country: "Falkland Islands", longitude: -57.85, latitude: -51.7 },
  { name: "Laayoune", country: "Western Sahara", longitude: -13.2033, latitude: 27.1536 },
  { name: "Riga", country: "Latvia", longitude: 24.1052, latitude: 56.9496 },
  { name: "Vilnius", country: "Lithuania", longitude: 25.2797, latitude: 54.6872 },
  { name: "Tallinn", country: "Estonia", longitude: 24.7536, latitude: 59.437 },
  { name: "Kyiv", country: "Ukraine", longitude: 30.5234, latitude: 50.4501 },
  { name: "Lviv", country: "Ukraine", longitude: 24.0297, latitude: 49.8397 },
  { name: "Odessa", country: "Ukraine", longitude: 30.7233, latitude: 46.4825 },
  { name: "Canberra", country: "Australia", longitude: 149.13, latitude: -35.2809 },
  { name: "Adelaide", country: "Australia", longitude: 138.6007, latitude: -34.9285 },
  { name: "Gold Coast", country: "Australia", longitude: 153.4009, latitude: -28.0167 },
  { name: "Hobart", country: "Australia", longitude: 147.3272, latitude: -42.8821 },
  { name: "Darwin", country: "Australia", longitude: 130.8456, latitude: -12.4634 },
  { name: "Cairns", country: "Australia", longitude: 145.7709, latitude: -16.9186 },
  { name: "Wellington", country: "New Zealand", longitude: 174.7762, latitude: -41.2865 },
  { name: "Christchurch", country: "New Zealand", longitude: 172.6362, latitude: -43.5321 },
  { name: "Nicosia", country: "Cyprus", longitude: 33.3823, latitude: 35.1856 },
  { name: "North Nicosia", country: "N. Cyprus", longitude: 33.3667, latitude: 35.1833 },
];

function locationRotation(value: string) {
  const hash = [...value.toLowerCase()].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 0);
  return { x: ((hash % 38) - 19) * (Math.PI / 180), y: (((hash >> 7) % 280) - 140) * (Math.PI / 180) };
}

function normalizedPlaceName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9,\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lineFromCoordinates(coordinates: number[][], radius: number) {
  const points = coordinates.map(([longitude, latitude]) => {
    const phi = (90 - latitude) * (Math.PI / 180);
    const theta = (longitude + 180) * (Math.PI / 180);
    return new THREE.Vector3(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
  });
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xcff6e6, transparent: true, opacity: .48 }));
}

function spherePoint(longitude: number, latitude: number, radius: number) {
  const phi = (90 - latitude) * (Math.PI / 180);
  const theta = (longitude + 180) * (Math.PI / 180);
  return new THREE.Vector3(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
}

function locationRotationFromCoordinates(longitude: number, latitude: number) {
  return {
    x: THREE.MathUtils.clamp(latitude * (Math.PI / 180), -Math.PI / 2.2, Math.PI / 2.2),
    y: -((longitude + 90) * (Math.PI / 180)),
  };
}

function countryCenter(feature: CountryFeature): [number, number] | null {
  const geometry = feature.geometry;
  if (!geometry) return null;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  let longitudeTotal = 0;
  let latitudeTotal = 0;
  let count = 0;
  polygons.forEach((polygon) => {
    const outerRing = polygon[0] || [];
    outerRing.forEach(([longitude, latitude]) => {
      longitudeTotal += longitude;
      latitudeTotal += latitude;
      count += 1;
    });
  });
  if (!count) return null;
  return [longitudeTotal / count, latitudeTotal / count];
}

const cityLookup = (() => {
  const lookup = new Map<string, CityMarker>();
  CITY_MARKERS.forEach((city) => {
    const cityOnly = normalizedPlaceName(city.name);
    const cityWithCountry = normalizedPlaceName(`${city.name}, ${city.country}`);
    if (!lookup.has(cityOnly)) lookup.set(cityOnly, city);
    if (!lookup.has(cityWithCountry)) lookup.set(cityWithCountry, city);
  });
  return lookup;
})();

function resolveLocationTarget(value: string, countries: CountryFeature[], countryCenters: Map<string, [number, number]>) {
  const cleaned = value.trim();
  if (!cleaned) return null;
  const normalized = normalizedPlaceName(cleaned);
  if (!normalized) return null;
  const directCity = cityLookup.get(normalized);
  if (directCity) return { longitude: directCity.longitude, latitude: directCity.latitude };
  const parts = normalized.split(",").map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    const city = cityLookup.get(part);
    if (city) return { longitude: city.longitude, latitude: city.latitude };
  }
  const wantedCountry = countryKey(cleaned);
  const match = countries.find((country) => countryKey(country.properties?.name) === wantedCountry);
  if (!match) return null;
  const center = countryCenters.get(wantedCountry) || countryCenter(match);
  if (!center) return null;
  return { longitude: center[0], latitude: center[1] };
}

function countryKey(country?: string | null) {
  const normalized = (country || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
  if (normalized === "unitedstates" || normalized === "unitedstatesofamerica") return "usa";
  if (normalized === "unitedkingdom" || normalized === "greatbritain") return "uk";
  if (normalized === "cotedivoire" || normalized === "ivorycoast") return "cotedivoire";
  if (normalized === "democraticrepublicofthecongo" || normalized === "demrepcongo" || normalized === "drcongo") return "drcongo";
  if (normalized === "centralafricanrep" || normalized === "centralafricanrepublic") return "centralafricanrepublic";
  if (normalized === "equatorialguinea" || normalized === "eqguinea") return "equatorialguinea";
  if (normalized === "southsudan" || normalized === "ssudan") return "southsudan";
  if (normalized === "bosniaandherz" || normalized === "bosniaandherzegovina") return "bosniaandherzegovina";
  if (normalized === "russianfederation") return "russia";
  if (normalized === "czechrepublic") return "czechia";
  if (normalized === "republicofkorea" || normalized === "southkorea") return "korea";
  if (normalized === "northkorea") return "northkorea";
  if (normalized === "vietname") return "vietnam";
  if (normalized === "unitedarabemirates") return "uae";
  if (normalized === "southafrica") return "southafrica";
  if (normalized === "newzealand") return "newzealand";
  if (normalized === "dominicanrep" || normalized === "dominicanrepublic") return "dominicanrepublic";
  if (normalized === "papuanewguinea") return "papuanewguinea";
  if (normalized === "solomonis" || normalized === "solomonislands") return "solomonislands";
  if (normalized === "newcaledonia") return "newcaledonia";
  if (normalized === "falklandis" || normalized === "falklandislands") return "falklandislands";
  if (normalized === "wsahara" || normalized === "westernsahara") return "westernsahara";
  if (normalized === "ncyprus" || normalized === "northcyprus") return "northcyprus";
  if (normalized === "trinidadandtobago") return "trinidadandtobago";
  return normalized;
}

function cityLabelSprite(city: CityMarker) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = 256;
  canvas.height = 72;
  if (!context) return null;
  context.font = "800 23px Arial, sans-serif";
  context.shadowColor = "rgba(255, 255, 255, .9)";
  context.shadowBlur = 7;
  context.fillStyle = "#f7fff7";
  context.strokeStyle = "rgba(12, 42, 37, .82)";
  context.lineWidth = 5;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.strokeText(city.name, canvas.width / 2, 34);
  context.fillText(city.name, canvas.width / 2, 34);
  context.shadowBlur = 0;
  context.fillStyle = "#ff805f";
  context.beginPath();
  context.arc(canvas.width / 2, 60, 5, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "rgba(255, 255, 255, .85)";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(canvas.width / 2, 60, 6, 0, Math.PI * 2);
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthTest: true, depthWrite: false });
  const width = Math.min(.54, Math.max(.22, city.name.length * .021));
  const sprite = new THREE.Sprite(material);
  const normal = spherePoint(city.longitude, city.latitude, 1).normalize();
  // Keep the city marker on the country surface. The small outward offset is
  // only enough to avoid z-fighting with the Earth texture and border lines.
  sprite.position.copy(normal.clone().multiplyScalar(1.466));
  // The orange dot is the anchor: text grows upward from the point on the globe
  // instead of placing the whole billboard above it.
  sprite.center.set(.5, .17);
  sprite.scale.set(width, width * .28, 1);
  sprite.userData.surfaceNormal = normal;
  sprite.userData.city = city;
  sprite.userData.country = city.country;
  sprite.userData.countryKey = countryKey(city.country);
  return sprite;
}

function angularDistance(point: [number, number], city: CityMarker) {
  const latitudeOne = point[1] * (Math.PI / 180);
  const latitudeTwo = city.latitude * (Math.PI / 180);
  const deltaLatitude = (city.latitude - point[1]) * (Math.PI / 180);
  const deltaLongitude = (city.longitude - point[0]) * (Math.PI / 180);
  const a = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(deltaLongitude / 2) ** 2;
  return Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestCity(point: [number, number]) {
  return CITY_MARKERS.reduce((closest, city) => angularDistance(point, city) < angularDistance(point, closest) ? city : closest, CITY_MARKERS[0]);
}

function nearestCityInCountry(point: [number, number], country: string, countries: CountryFeature[]) {
  const wantedCountry = countryKey(country);
  const matches = CITY_MARKERS.filter((city) => {
    const cityCountry = city.country || countryAt([city.longitude, city.latitude], countries);
    return countryKey(cityCountry) === wantedCountry;
  });
  if (!matches.length) return null;
  return matches.reduce((closest, city) => angularDistance(point, city) < angularDistance(point, closest) ? city : closest, matches[0]);
}

function pointInRing(point: [number, number], ring: number[][]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index]; const [previousX, previousY] = ring[previous];
    if (((y > point[1]) !== (previousY > point[1])) && (point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x)) inside = !inside;
  }
  return inside;
}

function countryAt(point: [number, number], countries: CountryFeature[]) {
  return countries.find((country) => {
    const geometry = country.geometry;
    if (!geometry) return false;
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
    return (polygons as number[][][][]).some((polygon) => pointInRing(point, polygon[0]));
  })?.properties?.name;
}

export function InteractiveGlobe({ location, reducedMotion, onSelectCountry }: InteractiveGlobeProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const globeGroupRef = useRef<THREE.Group | null>(null);
  const globeMeshRef = useRef<THREE.Mesh | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const selectionRef = useRef<THREE.Object3D | null>(null);
  const pinTextureRef = useRef<THREE.Texture | null>(null);
  const cityLabelsRef = useRef<THREE.Sprite[]>([]);
  const countriesRef = useRef<CountryFeature[]>([]);
  const countryCentersRef = useRef<Map<string, [number, number]>>(new Map());
  const hoveredCountryRef = useRef<string | null>(null);
  const skipLocationRotationRef = useRef(false);
  const draggingRef = useRef({ active: false, x: 0, y: 0 });
  const rotationTargetRef = useRef(new THREE.Euler(.13, -.78, -.08));
  const zoomTargetRef = useRef(4.9);
  const [selected, setSelected] = useState<string | null>(null);

  function pointerRay(event: React.PointerEvent<HTMLDivElement>, camera: THREE.PerspectiveCamera, raycaster: THREE.Raycaster) {
    const canvas = mountRef.current?.querySelector("canvas");
    const bounds = (canvas || event.currentTarget).getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    ), camera);
  }

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
    camera.position.set(0, 0, 4.9);
    cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.replaceChildren(renderer.domElement);
    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      zoomTargetRef.current = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomTargetRef.current + event.deltaY * .0045));
    };
    mount.addEventListener("wheel", handleNativeWheel, { passive: false });

    const group = new THREE.Group();
    group.rotation.set(.13, -.78, -.08);
    rotationTargetRef.current.set(.13, -.78, -.08);
    globeGroupRef.current = group;
    scene.add(group);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1.45, 96, 96), new THREE.MeshPhongMaterial({ color: 0x2f91ac, shininess: 9, specular: 0x23465d }));
    globeMeshRef.current = globe;
    group.add(globe);
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load("/globe-pin-marker.png", (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      pinTextureRef.current = texture;
    });
    textureLoader.load("https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg", (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      globe.material = new THREE.MeshPhongMaterial({ map: texture, shininess: 7, specular: 0x213c56 });
    });
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.49, 96, 96), new THREE.MeshBasicMaterial({ color: 0x83e8ff, transparent: true, opacity: .13, side: THREE.BackSide }));
    group.add(atmosphere);
    const light = new THREE.DirectionalLight(0xffffff, 2.8);
    light.position.set(3, 3, 5);
    scene.add(light, new THREE.AmbientLight(0x80c7df, 1.05));
    const cityLabels = CITY_MARKERS.map(cityLabelSprite).filter((label): label is THREE.Sprite => Boolean(label));
    cityLabelsRef.current = cityLabels;
    cityLabels.forEach((label) => group.add(label));

    void fetch("/world-countries-110m.json").then((response) => response.json()).then((topology: Topology) => {
      const countryObject = topology.objects.countries;
      if (!countryObject) return;
      const world = feature(topology as never, countryObject as never) as { features?: CountryFeature[] };
      countriesRef.current = world.features || [];
      countryCentersRef.current = new Map(
        (world.features || [])
          .map((country) => {
            const center = countryCenter(country);
            if (!center) return null;
            return [countryKey(country.properties?.name), center] as const;
          })
          .filter((entry): entry is readonly [string, [number, number]] => Boolean(entry)),
      );
      cityLabelsRef.current.forEach((label) => {
        const city = label.userData.city as CityMarker | undefined;
        if (city && !label.userData.country) label.userData.country = countryAt([city.longitude, city.latitude], countriesRef.current);
        label.userData.countryKey = countryKey(label.userData.country as string | undefined);
      });
      world.features?.forEach((country) => {
        const geometry = country.geometry;
        if (!geometry) return;
        const rings = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
        rings.forEach((polygon) => (polygon as number[][][]).forEach((ring) => group.add(lineFromCoordinates(ring, 1.462))));
      });
    }).catch(() => undefined);

    let frame = 0;
    const render = () => {
      group.rotation.x += (rotationTargetRef.current.x - group.rotation.x) * .16;
      group.rotation.y += (rotationTargetRef.current.y - group.rotation.y) * .16;
      camera.position.z += (zoomTargetRef.current - camera.position.z) * .14;
      if (selectionRef.current?.userData.bornAt) {
        const age = Math.min(1, (performance.now() - selectionRef.current.userData.bornAt) / 430);
        const bounce = Math.sin(age * Math.PI) * .48;
        const rock = Math.sin(age * Math.PI * 6) * (1 - age) * .62;
        const baseScale = selectionRef.current.userData.baseScale as THREE.Vector3 | undefined;
        const basePosition = selectionRef.current.userData.basePosition as THREE.Vector3 | undefined;
        if (baseScale) selectionRef.current.scale.copy(baseScale).multiplyScalar(1 + bounce);
        if (basePosition) selectionRef.current.position.copy(basePosition).multiplyScalar(1 + Math.sin(age * Math.PI) * .018);
        const material = selectionRef.current instanceof THREE.Sprite ? selectionRef.current.material as THREE.SpriteMaterial : null;
        if (material) material.rotation = rock;
      }
      const cityOpacity = THREE.MathUtils.clamp((4.85 - camera.position.z) / 1.25, 0, .9);
      const hoveredCountry = hoveredCountryRef.current;
      cityLabelsRef.current.forEach((label) => {
        const material = label.material as THREE.SpriteMaterial;
        const worldPosition = label.getWorldPosition(new THREE.Vector3()).normalize();
        const facingCamera = worldPosition.z > -.16;
        const matchesHover = Boolean(hoveredCountry && label.userData.countryKey === hoveredCountry);
        material.opacity += (((facingCamera && matchesHover ? cityOpacity : 0)) - material.opacity) * .18;
        label.visible = material.opacity > .01;
      });
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();
    const resize = () => { const size = Math.min(mount.clientWidth, mount.clientHeight); renderer.setSize(size, size); camera.aspect = 1; camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mount.removeEventListener("wheel", handleNativeWheel);
      cityLabels.forEach((label) => {
        label.material.map?.dispose();
        label.material.dispose();
      });
      cityLabelsRef.current = [];
      pinTextureRef.current?.dispose();
      pinTextureRef.current = null;
      renderer.dispose();
      globe.geometry.dispose();
      (globe.material as THREE.Material).dispose();
    };
  }, [reducedMotion]);

  useEffect(() => {
    const group = globeGroupRef.current;
    if (!group || !location.trim()) return;
    if (skipLocationRotationRef.current) {
      skipLocationRotationRef.current = false;
      return;
    }
    const resolvedLocation = resolveLocationTarget(location, countriesRef.current, countryCentersRef.current);
    const destination = resolvedLocation
      ? locationRotationFromCoordinates(resolvedLocation.longitude, resolvedLocation.latitude)
      : locationRotation(location);
    rotationTargetRef.current.x = destination.x;
    rotationTargetRef.current.y = destination.y;
  }, [location]);

  function selectPoint(event: React.PointerEvent<HTMLDivElement>) {
    const globe = globeMeshRef.current;
    const camera = cameraRef.current;
    if (!globe || !camera) return;
    const raycaster = new THREE.Raycaster();
    pointerRay(event, camera, raycaster);
    const hit = raycaster.intersectObject(globe)[0];
    if (!hit) return;
    const group = globeGroupRef.current;
    if (!group) return;
    if (selectionRef.current) selectionRef.current.removeFromParent();
    const localPoint = group.worldToLocal(hit.point.clone()).normalize();
    const marker = pinTextureRef.current
      ? new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTextureRef.current, transparent: true, depthTest: true, depthWrite: false }))
      : new THREE.Mesh(new THREE.SphereGeometry(.052, 20, 20), new THREE.MeshBasicMaterial({ color: 0xff805f }));
    if (marker instanceof THREE.Sprite) marker.center.set(.5, .09);
    const pinScale = .055;
    marker.position.copy(localPoint.multiplyScalar(1.468));
    marker.scale.set(pinScale, pinScale, pinScale);
    marker.userData.baseScale = new THREE.Vector3(pinScale, pinScale, pinScale);
    marker.userData.basePosition = marker.position.clone();
    marker.userData.bornAt = performance.now();
    group.add(marker);
    selectionRef.current = marker;
    const normal = marker.position.clone().normalize();
    const latitude = 90 - (Math.acos(normal.y) * 180) / Math.PI;
    let longitude = (Math.atan2(normal.z, -normal.x) * 180) / Math.PI - 180;
    if (longitude < -180) longitude += 360;
    const clickedCountry = countryAt([longitude, latitude], countriesRef.current);
    const city = clickedCountry ? nearestCityInCountry([longitude, latitude], clickedCountry, countriesRef.current) : null;
    // Never cross a border just to return a nearby city. When city coverage is
    // sparse, selecting the correct country is more useful than a wrong city.
    const place = clickedCountry
      ? (city ? `${city.name}, ${clickedCountry}` : clickedCountry)
      : (() => {
        const nearby = nearestCity([longitude, latitude]);
        const nearbyCountry = nearby.country || countryAt([nearby.longitude, nearby.latitude], countriesRef.current);
        return nearbyCountry ? `${nearby.name}, ${nearbyCountry}` : nearby.name;
      })();
    setSelected(place);
    const destination = locationRotationFromCoordinates(longitude, latitude);
    rotationTargetRef.current.x = destination.x;
    rotationTargetRef.current.y = destination.y;
    skipLocationRotationRef.current = true;
    onSelectCountry({ label: place, latitude, longitude });
  }

  function hoveredPointCountry(event: React.PointerEvent<HTMLDivElement>) {
    const globe = globeMeshRef.current;
    const camera = cameraRef.current;
    const group = globeGroupRef.current;
    if (!globe || !camera || !group) return null;
    const raycaster = new THREE.Raycaster();
    pointerRay(event, camera, raycaster);
    const hit = raycaster.intersectObject(globe)[0];
    if (!hit) return null;
    const localPoint = group.worldToLocal(hit.point.clone()).normalize();
    const latitude = 90 - (Math.acos(localPoint.y) * 180) / Math.PI;
    let longitude = (Math.atan2(localPoint.z, -localPoint.x) * 180) / Math.PI - 180;
    if (longitude < -180) longitude += 360;
    const nearby = nearestCity([longitude, latitude]);
    const polygonCountry = countryKey(countryAt([longitude, latitude], countriesRef.current));
    const nearestCountry = countryKey(nearby.country);
    // Coastlines and tiny country polygons can be a few pixels away from the
    // ray hit. If the polygon has no city labels, prefer the nearest known city
    // so countries such as Laos still reveal their city names reliably.
    const hasLabels = polygonCountry && cityLabelsRef.current.some((label) => label.userData.countryKey === polygonCountry);
    return (hasLabels ? polygonCountry : nearestCountry) || polygonCountry || nearestCountry;
  }

  function beginDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button === 0) { selectPoint(event); return; }
    if (event.button !== 2) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const drag = draggingRef.current;
    drag.active = true; drag.x = event.clientX; drag.y = event.clientY;
  }
  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = draggingRef.current;
    const group = globeGroupRef.current;
    if (!drag.active || !group) {
      hoveredCountryRef.current = hoveredPointCountry(event);
      return;
    }
    const dx = event.clientX - drag.x; const dy = event.clientY - drag.y;
    rotationTargetRef.current.y += dx * .004;
    rotationTargetRef.current.x = Math.max(-1.25, Math.min(1.25, rotationTargetRef.current.x + dy * .0026));
    drag.x = event.clientX; drag.y = event.clientY;
  }
  function endDrag(event: React.PointerEvent<HTMLDivElement>) { if (!draggingRef.current.active) return; draggingRef.current.active = false; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }
  function zoom(event: React.WheelEvent<HTMLDivElement>) { event.preventDefault(); event.stopPropagation(); zoomTargetRef.current = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomTargetRef.current + event.deltaY * .0045)); }

  return <div className="interactive-globe-wrap">
    <div ref={mountRef} className="interactive-globe-canvas" onContextMenu={(event) => event.preventDefault()} onWheel={zoom} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerLeave={() => { hoveredCountryRef.current = null; }} onPointerUp={endDrag} onPointerCancel={endDrag} role="img" aria-label="Interactive 3D Earth. Scroll to zoom. Right-drag to rotate country outlines. Left-click to select a country." />
    {location.trim() && <div className="globe-location-readout"><span>Destination</span><strong>{location}</strong></div>}
    <div className="globe-interaction-hint">{selected ? <><strong>{selected}</strong><span>Selected · scroll to zoom</span></> : <><strong>Explore the globe</strong><span>Left-click to select · right-drag to rotate · scroll to zoom</span></>}</div>
  </div>;
}
