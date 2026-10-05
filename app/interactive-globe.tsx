"use client";

import { globeViewport } from "./lib/globe-viewport";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { feature } from "topojson-client";

type GlobeSelection = { label: string; latitude: number; longitude: number };
type InteractiveGlobeProps = { location: string; reducedMotion: boolean | null; presentation?: "destination" | "meal"; onSelectCountry: (selection: GlobeSelection) => void };

type Topology = { objects: Record<string, unknown> };
type CountryFeature = {
  geometry?: { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] };
  properties?: { name?: string };
};
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
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.computeBoundingSphere();
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xd7ddbb, transparent: true, opacity: 0, depthTest: true, depthWrite: false }));
  line.visible = false;
  return line;
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
  if (!context) return null;
  const fontSize = 28;
  context.font = `600 ${fontSize}px Arial, sans-serif`;
  const logicalWidth = Math.ceil(context.measureText(city.name).width) + 32;
  canvas.width = logicalWidth * 2;
  canvas.height = 104;
  context.scale(2, 2);
  context.font = `600 ${fontSize}px Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.strokeStyle = "#07101e";
  context.lineWidth = 4;
  context.strokeText(city.name, logicalWidth / 2, 19);
  context.fillStyle = "#ffffff";
  context.fillText(city.name, logicalWidth / 2, 19);
  context.fillStyle = "#ffc980";
  context.beginPath();
  context.arc(logicalWidth / 2, 43, 3, 0, Math.PI * 2);
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
  const width = logicalWidth;
  const sprite = new THREE.Sprite(material);
  sprite.userData.labelWidth = logicalWidth;
  const normal = spherePoint(city.longitude, city.latitude, 1).normalize();
  // Keep the city marker on the country surface. The small outward offset is
  // only enough to avoid z-fighting with the Earth texture and border lines.
  sprite.position.copy(normal.clone().multiplyScalar(1.466));
  // The orange dot is the anchor: text grows upward from the point on the globe
  // instead of placing the whole billboard above it.
  sprite.center.set(.5, .17);
  sprite.scale.set(width * .002, .104, 1);
  sprite.visible = false;
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

export function InteractiveGlobe({ location, reducedMotion, presentation = "destination", onSelectCountry }: InteractiveGlobeProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const globeGroupRef = useRef<THREE.Group | null>(null);
  const globeMeshRef = useRef<THREE.Mesh | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const selectionRef = useRef<THREE.Object3D | null>(null);
  const selectedCoordinatesRef = useRef<{ longitude: number; latitude: number } | null>(null);
  const cityLabelsRef = useRef<THREE.Sprite[]>([]);
  const countriesRef = useRef<CountryFeature[]>([]);
  const countryCentersRef = useRef<Map<string, [number, number]>>(new Map());
  const hoveredCountryRef = useRef<string | null>(null);
  const hoveredPointLocalRef = useRef<THREE.Vector3 | null>(null);
  const countryLinesRef = useRef<THREE.Line[]>([]);
  const lastHoverSampleRef = useRef(0);
  const skipLocationRotationRef = useRef(false);
  const draggingRef = useRef({ active: false, x: 0, y: 0, startX: 0, startY: 0, moved: false, touch: false });
  const touchesRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistanceRef = useRef(0);
  const pinchCenterRef = useRef<{ x: number; y: number } | null>(null);
  // Render only while interaction/asset loading needs it. Keeping this short
  // prevents a pointer move from waking a long tail of expensive WebGL frames.
  const renderFramesRef = useRef(36);
  const rotationTargetRef = useRef(new THREE.Euler(.13, -.78, -.08));
  const zoomTargetRef = useRef(5.1);
  const presentationRef = useRef(presentation);
  const destinationZoomRef = useRef<number | null>(null);
  const cameraTransitionRef = useRef<{ from: number; to: number; elapsed: number } | null>(null);
  const mealTiltRef = useRef({ base: .6, elapsed: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const [textureReady, setTextureReady] = useState(false);

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
    const compactViewport = window.matchMedia("(max-width: 760px), (max-width: 960px) and (max-height: 520px)");
    const { fov, overviewDistance } = globeViewport(mount.clientWidth, mount.clientHeight, compactViewport.matches);
    const camera = new THREE.PerspectiveCamera(fov, 1, .1, 20000);
    zoomTargetRef.current = THREE.MathUtils.clamp(overviewDistance, MIN_ZOOM, MAX_ZOOM);
    camera.position.set(0, 0, zoomTargetRef.current);
    cameraRef.current = camera;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" }); }
    catch { return; } // Keep the static Earth preview and the location input usable.
    // A 1.25x cap keeps the globe crisp without multiplying every fragment on
    // high-DPI displays. The Earth texture itself supplies the detail.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.16;
    mount.replaceChildren(renderer.domElement);
    const handleNativeWheel = (event: WheelEvent) => {
      if (presentationRef.current === "meal") return;
      cameraTransitionRef.current = null;
      event.preventDefault();
      event.stopPropagation();
      zoomTargetRef.current = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomTargetRef.current * Math.exp(THREE.MathUtils.clamp(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? mount.clientHeight : 1), -180, 180) * .0015)));
      renderFramesRef.current = 30;
    };
    mount.addEventListener("wheel", handleNativeWheel, { passive: false });
    const stopDrag = () => {
      draggingRef.current.active = false;
      touchesRef.current.clear();
      pinchDistanceRef.current = 0;
      pinchCenterRef.current = null;
    };
    window.addEventListener("blur", stopDrag);

    const group = new THREE.Group();
    group.rotation.set(.6, -1.62, 0);
    rotationTargetRef.current.set(.6, -1.62, 0);
    globeGroupRef.current = group;
    scene.add(group);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1.45, 64, 48), new THREE.MeshPhongMaterial({ transparent: true, opacity: 0 }));
    globeMeshRef.current = globe;
    group.add(globe);
    const textureLoader = new THREE.TextureLoader();
    let disposed = false;
    const sunlightDirection = new THREE.Vector3(1, 1, -1).normalize();
    // Natural colour and relief maps retain the reference Earth detail.
    textureLoader.load(compactViewport.matches ? "/earth-atmos-2048.jpg" : "/earth-day-5400.jpg", (texture) => {
      if (disposed) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      (globe.material as THREE.Material).dispose();
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      globe.material = new THREE.MeshPhongMaterial({
        map: texture,
        color: 0xffffff,
        shininess: 48,
        specular: 0xb8a485,
        emissive: 0x030916,
        emissiveIntensity: .12,
      });
      (globe.material as THREE.MeshPhongMaterial).onBeforeCompile = shader => {
        // The cool readability fill must never create a second "sun" reflection.
        // Only the actual solar light contributes to specular ocean highlights.
        shader.uniforms.solarDirection = { value: sunlightDirection };
        shader.fragmentShader = "uniform vec3 solarDirection;\n" + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace("#include <lights_phong_pars_fragment>", THREE.ShaderChunk.lights_phong_pars_fragment.replace(
          "reflectedLight.directSpecular += irradiance",
          "reflectedLight.directSpecular += irradiance * smoothstep(.995, .999, dot(directLight.direction, solarDirection))"
        ));
        shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
          #include <map_fragment>
          float luminance = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(luminance), 0.28);
          diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(0.92)) * 0.86 + vec3(0.018, 0.024, 0.031);
        `);
      };
      textureLoader.load("/earth-specular.jpg", detail => {
        if (disposed) { detail.dispose(); return; }
        const material = globe.material as THREE.MeshPhongMaterial;
        material.specularMap = detail;
        material.needsUpdate = true;
        renderFramesRef.current = 30;
      });
      setTextureReady(true);
      renderFramesRef.current = 30;
      textureLoader.load("/earth-normal.jpg", detail => {
        if (disposed) { detail.dispose(); return; }
        const material = globe.material as THREE.MeshPhongMaterial;
        detail.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        material.normalMap = detail;
        material.normalScale.set(.085, .085);
        material.needsUpdate = true;
        renderFramesRef.current = 30;
      });
    });
    // Warm directional sunlight and a cool fill preserve natural land/sea contrast.
    const light = new THREE.DirectionalLight(0xffe8cc, 2.2);
    light.position.set(3, 2, 4);
    scene.add(light, new THREE.AmbientLight(0xe0e5e8, 1.65));
    const sun = new THREE.Mesh(new THREE.SphereGeometry(.21, 48, 32), new THREE.ShaderMaterial({
      toneMapped: false, transparent: true, depthWrite: false,
      vertexShader: `varying vec3 n; varying vec3 v; varying vec3 p; void main(){ vec4 view=modelViewMatrix*vec4(position,1.); n=normalize(normalMatrix*normal); v=normalize(-view.xyz); p=position; gl_Position=projectionMatrix*view; }`,
      fragmentShader: `
        varying vec3 n; varying vec3 v; varying vec3 p;
        float hash(vec3 q){ return fract(sin(dot(q,vec3(127.1,311.7,74.7)))*43758.5453); }
        float noise(vec3 q){
          vec3 i=floor(q),f=fract(q); f=f*f*(3.-2.*f);
          return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
        }
        void main(){
          float facing=max(dot(normalize(n),normalize(v)),0.);
          vec3 surface=normalize(p);
          float convection=noise(surface*14.);
          float granules=noise(surface*95.+convection*2.);
          float filaments=pow(1.-abs(noise(surface*37.)*2.-1.),9.);
          float heat=clamp(.4+convection*.32+granules*.25+filaments*.08,0.,1.);
          vec3 plasma=mix(vec3(1.,.38,.07),vec3(1.,.86,.44),heat);
          float center=pow(facing,.55);
          vec3 color=mix(plasma,vec3(1.,.985,.9),center*(.57+heat*.26));
          gl_FragColor=vec4(color,smoothstep(0.,.14,facing));
        }`,
    }));
    const corona = new THREE.Mesh(new THREE.SphereGeometry(.56, 48, 32), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      vertexShader: `varying vec3 n; varying vec3 v; void main(){ vec4 p=modelViewMatrix*vec4(position,1.); n=normalize(normalMatrix*normal); v=normalize(-p.xyz); gl_Position=projectionMatrix*p; }`,
      fragmentShader: `varying vec3 n; varying vec3 v; void main(){ float f=max(dot(normalize(n),normalize(v)),0.); float glow=pow(smoothstep(.3,.94,f),3.)*(1.-smoothstep(.91,.985,f))*.36; gl_FragColor=vec4(1.,.73,.32,glow); }`,
    }));
    sun.add(corona);
    // Actual tapered volumes distributed over a sphere, rendered in one batch.
    const sunRays = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7, 6, true), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
      uniforms: { rayTime: { value: 0 } },
      vertexShader: `uniform float rayTime; varying float along; varying vec3 n; varying vec3 v; void main(){ along=uv.y; vec4 local=instanceMatrix*vec4(position,1.); vec3 radial=normalize(instanceMatrix[3].xyz); vec3 tangent=cross(radial,vec3(.31,.87,.38)); local.xyz+=tangent*sin(rayTime*.8+dot(radial,vec3(7.,13.,19.))+along*3.)*.045*along*along; vec4 p=modelViewMatrix*local; n=normalize(normalMatrix*mat3(instanceMatrix)*normal); v=normalize(-p.xyz); gl_Position=projectionMatrix*p; }`,
      fragmentShader: `varying float along; varying vec3 n; varying vec3 v; void main(){ float taper=pow(1.-along,2.8)*smoothstep(0.,.1,along); float feather=smoothstep(0.,.55,abs(dot(normalize(n),normalize(v)))); gl_FragColor=vec4(1.,.78,.45,taper*feather*.24); }`,
    }), 96);
    const rayTransform = new THREE.Object3D();
    const rayDirection = new THREE.Vector3();
    const rayUp = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 96; i++) {
      const y = 1 - 2 * (i + .5) / 96;
      const angle = i * 2.3999632297;
      const radius = Math.sqrt(1 - y * y);
      rayDirection.set(radius * Math.cos(angle), y, radius * Math.sin(angle));
      const length = .27 + (.5 + .5 * Math.sin(i * 17.17)) * .38;
      const width = .007 + (.5 + .5 * Math.sin(i * 9.71)) * .012;
      rayTransform.position.copy(rayDirection).multiplyScalar(.205 + length / 2);
      rayTransform.quaternion.setFromUnitVectors(rayUp, rayDirection);
      rayTransform.scale.set(width, length, width);
      rayTransform.updateMatrix();
      sunRays.setMatrixAt(i, rayTransform.matrix);
    }
    sunRays.instanceMatrix.needsUpdate = true;
    sun.add(sunRays);
    // Distant source: thousands of Earth radii away, with a scaled solar
    // body/corona so the apparent size stays readable instead of vanishing.
    sun.position.set(3000, 2600, -4800);
    sun.scale.setScalar(600);
    const spaceOrbit = new THREE.Group();
    spaceOrbit.add(sun);
    scene.add(spaceOrbit);
    const initialRotationInverse = group.quaternion.clone().invert();
    const oceanFill = new THREE.DirectionalLight(0xb7d1e7, .7);
    oceanFill.position.set(-4, 1, 3);
    scene.add(oceanFill);
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.59, 80, 56), new THREE.ShaderMaterial({
      uniforms: { sunDirection: { value: new THREE.Vector3(1, 1, -1).normalize() } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 n; varying vec3 v; void main(){ vec4 p=modelViewMatrix*vec4(position,1.0); n=normalize(normalMatrix*normal); v=normalize(-p.xyz); gl_Position=projectionMatrix*p; }`,
      fragmentShader: `
        uniform vec3 sunDirection; varying vec3 n; varying vec3 v;
        void main(){
          vec3 normal=normalize(n);
          float facing=max(dot(normal,normalize(v)),0.);
          float feather=smoothstep(0.,.52,facing);
          float rim=pow(1.-facing,2.7)*feather*feather;
          // Project the source onto the sky: its nearest limb stays luminous
          // even when the solid Earth occludes the distant solar disk.
          vec2 towardSun=length(sunDirection.xy)>.001?normalize(sunDirection.xy):normalize(vec2(1.,1.));
          vec2 edgeDirection=length(normal.xy)>.001?normalize(normal.xy):vec2(0.);
          float sunward=smoothstep(-.25,.9,dot(edgeDirection,towardSun));
          vec3 glow=mix(vec3(.32,.53,.76),vec3(1.,.81,.48),sunward);
          gl_FragColor=vec4(glow,rim*(.7+sunward*1.7));
        }`,
    }));
    group.add(atmosphere);
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.456, 64, 48), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    group.add(clouds);
    textureLoader.load("/earth-clouds.jpg", texture => {
      if (disposed) { texture.dispose(); return; }
      clouds.material.alphaMap = texture;
      clouds.material.opacity = .3;
      clouds.material.needsUpdate = true;
      renderFramesRef.current = 30;
    });
    // A single GPU point batch: soft cores and velocity-shaped trails, without
    // full-screen blur passes or individual DOM stars.
    const starPositions = new Float32Array(1100 * 3);
    const starSizes = new Float32Array(1100);
    // Seeded randomness keeps this sky stable across remounts while avoiding
    // a visible grid. Mix sparse background stars with loose spherical clusters.
    let seed = 19471;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const randomDirection = () => {
      const y = random() * 2 - 1;
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(1 - y * y);
      return new THREE.Vector3(radius * Math.cos(angle), y, radius * Math.sin(angle));
    };
    const clusters = Array.from({ length: 22 }, () => ({ center: randomDirection(), spread: .07 + random() * .20 }));
    for (let i = 0; i < 1100; i++) {
      const position = randomDirection();
      if (random() < .58) {
        const cluster = clusters[Math.floor(random() * clusters.length)];
        position.multiplyScalar(cluster.spread * Math.sqrt(random())).add(cluster.center).normalize();
      }
      position.multiplyScalar(32);
      starPositions.set([position.x, position.y, position.z], i * 3);
      starSizes[i] = 3 + Math.pow(random(), 2) * 10;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute("size", new THREE.BufferAttribute(starSizes, 1));
    const starMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { velocity: { value: new THREE.Vector2() }, pixelRatio: { value: renderer.getPixelRatio() } },
      vertexShader: `attribute float size; uniform vec2 velocity; uniform float pixelRatio; varying float trail; void main(){ trail=min(length(velocity)*4.0,1.8); gl_PointSize=(size+trail*3.0)*pixelRatio; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec2 velocity; varying float trail; void main(){ vec2 p=gl_PointCoord-0.5; vec2 direction=length(velocity)>0.001?normalize(velocity):vec2(1.,0.); vec2 q=vec2(dot(p,direction),dot(p,vec2(-direction.y,direction.x))); float core=exp(-dot(p,p)*80.0)+0.22*exp(-dot(p,p)*14.0); float streak=exp(-q.x*q.x*22.0-q.y*q.y*(80.0+trail*160.0)); float alpha=mix(core,streak,min(trail*.3,.45)); gl_FragColor=vec4(0.78,0.86,1.0,alpha*.78); }`,
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    stars.frustumCulled = false;
    spaceOrbit.add(stars);
    const cityLabels = CITY_MARKERS.map(cityLabelSprite).filter((label): label is THREE.Sprite => Boolean(label));
    cityLabelsRef.current = cityLabels;
    cityLabels.forEach((label) => group.add(label));

    void fetch("/world-countries-110m.json").then((response) => response.json()).then((raw: unknown) => {
      const topology = raw as Topology;
      if (disposed) return;
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
      const countryLines: THREE.Line[] = [];
      world.features?.forEach((country) => {
        const geometry = country.geometry;
        if (!geometry) return;
        const rings = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
        rings.forEach((polygon) => (polygon as number[][][]).forEach((ring) => {
          const line = lineFromCoordinates(ring, 1.462);
          line.userData.countryKey = countryKey(country.properties?.name);
          countryLines.push(line);
          group.add(line);
        }));
      });
      countryLinesRef.current = countryLines;
      renderFramesRef.current = 30;
    }).catch(() => undefined);

    let frame = 0;
    let visible = true;
    const visibility = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; if (visible) renderFramesRef.current = 30; });
    visibility.observe(mount);
    const worldPosition = new THREE.Vector3();
    let labelExclusions: { left: number; right: number; top: number; bottom: number }[] = [];
    const destinationScene = mount.closest<HTMLElement>(".ss-destination");
    let panelProgress = 0;
    let panelsHidden = false;
    let revealUntil = 0;
    let panelTimer: ReturnType<typeof setTimeout> | undefined;
    const panels = Array.from(destinationScene?.querySelectorAll<HTMLElement>(".ss-destination-copy,.ss-destination-summary") || []);
    const syncPanels = () => {
      if (presentationRef.current === "meal") return;
      const editing = panels.some(panel => panel.contains(document.activeElement)) && document.activeElement?.matches("input,textarea");
      const target = compactViewport.matches || performance.now() < revealUntil || editing ? 0 : THREE.MathUtils.smoothstep((4.9 - camera.position.z) / 1.7, 0, 1);
      if (Math.abs(target - panelProgress) > .001) renderFramesRef.current = Math.max(renderFramesRef.current, 2);
      panelProgress += (target - panelProgress) * (reducedMotion ? 1 : .18);
      destinationScene?.style.setProperty("--panel-progress", panelProgress.toFixed(4));
      const hidden = panelProgress > .97;
      if (hidden !== panelsHidden) {
        panelsHidden = hidden;
        destinationScene?.classList.toggle("is-globe-immersive", hidden);
        panels.forEach(panel => panel.setAttribute("aria-hidden", String(hidden)));
      }
    };
    const revealPanels = () => {
      revealUntil = performance.now() + 3000;
      clearTimeout(panelTimer);
      syncPanels();
      panelTimer = setTimeout(syncPanels, 3010);
    };
    destinationScene?.addEventListener("input", revealPanels);
    destinationScene?.addEventListener("keydown", revealPanels);
    destinationScene?.addEventListener("focusin", revealPanels);
    destinationScene?.addEventListener("focusout", revealPanels);
    let lastPaint = 0;
    const rayStartedAt = performance.now();
    let lastFrame = performance.now();
    const render = (now = performance.now()) => {
      frame = requestAnimationFrame(render);
      if (!visible || document.hidden) { lastFrame = now; return; }
      const mealMode = presentationRef.current === "meal";
      const idle = renderFramesRef.current <= 0;
      // Let the corona breathe at 24 fps when idle; interactions retain full RAF.
      if (idle && !mealMode && (reducedMotion || now - lastPaint < 1000 / 24)) return;
      if (mealMode && reducedMotion && idle) return;
      const delta = Math.min((now - lastFrame) / 1000, .05);
      lastFrame = now;
      lastPaint = now;
      renderFramesRef.current = Math.max(0, renderFramesRef.current - 1);
      const ease = reducedMotion ? 1 : 1 - Math.exp(-12 * delta);
      if (mealMode && !reducedMotion) {
        rotationTargetRef.current.y += delta * .035;
        const tilt = mealTiltRef.current;
        tilt.elapsed += delta;
        rotationTargetRef.current.x = tilt.base + Math.sin(tilt.elapsed * .14) * .085;
      }
      const previousX = group.rotation.x, previousY = group.rotation.y;
      group.rotation.x += (rotationTargetRef.current.x - group.rotation.x) * ease;
      group.rotation.y += (rotationTargetRef.current.y - group.rotation.y) * ease;
      // The sun orbits in world space, so perspective and Earth occlusion
      // determine its apparent size and the ocean's specular highlight.
      // One Earth-centered orbit keeps the entire sky coherent with dragging.
      // The sun now follows the full rotation (previously only one tenth).
      const rayTime = reducedMotion ? 0 : (now - rayStartedAt) / 1000;
      sunRays.material.uniforms.rayTime.value = rayTime;
      sunRays.rotation.set(rayTime * .027, rayTime * .045, rayTime * .018);
      // Fixed physical radius: size changes come exclusively from perspective.
      // Rotation moves the distant sun through an orbit with genuine depth.
      const orbitPhase = reducedMotion ? 0 : (group.rotation.y + 1.62) * .6;
      sun.position.set(3000 + 450 * Math.sin(orbitPhase), 2600 + 220 * Math.sin(orbitPhase * .7), -4800 + 1200 * Math.sin(orbitPhase));
      if (!reducedMotion) spaceOrbit.quaternion.copy(group.quaternion).multiply(initialRotationInverse);
      spaceOrbit.updateMatrixWorld(true);
      sun.getWorldPosition(light.position);
      sunlightDirection.copy(light.position).transformDirection(camera.matrixWorldInverse);
      atmosphere.material.uniforms.sunDirection.value.copy(light.position).transformDirection(camera.matrixWorldInverse);
      const velocity = starMaterial.uniforms.velocity.value as THREE.Vector2;
      velocity.lerp(new THREE.Vector2(reducedMotion ? 0 : (group.rotation.y - previousY) / Math.max(delta, .001), reducedMotion ? 0 : -(group.rotation.x - previousX) / Math.max(delta, .001)), 1 - Math.exp(-16 * delta));
      if (velocity.lengthSq() > .00001) renderFramesRef.current = Math.max(renderFramesRef.current, 2);
      const cameraTransition = cameraTransitionRef.current;
      if (cameraTransition) {
        cameraTransition.elapsed += delta;
        const progress = reducedMotion ? 1 : Math.min(cameraTransition.elapsed / 2.05, 1);
        // Smootherstep has zero velocity and zero acceleration at both ends,
        // making the Earth grow continuously without a visible size step.
        const eased = progress * progress * progress * (progress * (progress * 6 - 15) + 10);
        camera.position.z = THREE.MathUtils.lerp(cameraTransition.from, cameraTransition.to, eased);
        if (progress === 1) cameraTransitionRef.current = null;
        else renderFramesRef.current = Math.max(renderFramesRef.current, 2);
      } else camera.position.z += (zoomTargetRef.current - camera.position.z) * ease;
      if (selectionRef.current) selectionRef.current.visible = true;
      syncPanels();
      const moving = Math.abs(rotationTargetRef.current.x - group.rotation.x) + Math.abs(rotationTargetRef.current.y - group.rotation.y) + Math.abs(zoomTargetRef.current - camera.position.z) > .0001;
      if (moving || draggingRef.current.active) renderFramesRef.current = Math.max(renderFramesRef.current, 2);
      group.updateMatrixWorld(true);
      camera.updateMatrixWorld();
      if (selectionRef.current?.userData.billboard) selectionRef.current.quaternion.copy(group.quaternion).invert().multiply(camera.quaternion);
      if (selectionRef.current?.userData.bornAt) {
        const selectedAgeMs = performance.now() - selectionRef.current.userData.bornAt;
        const age = reducedMotion ? 1 : Math.min(1, selectedAgeMs / 430);
        const bounce = Math.sin(age * Math.PI) * .48;
        const rock = Math.sin(age * Math.PI * 6) * (1 - age) * .62;
        const baseScale = selectionRef.current.userData.baseScale as THREE.Vector3 | undefined;
        const basePosition = selectionRef.current.userData.basePosition as THREE.Vector3 | undefined;
        if (baseScale) selectionRef.current.scale.copy(baseScale).multiplyScalar(1 + bounce);
        if (basePosition) selectionRef.current.position.copy(basePosition).multiplyScalar(1 + Math.sin(age * Math.PI) * .018);
        const pulseRings = selectionRef.current.userData.pulseRings as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] | undefined;
        pulseRings?.forEach((ring, index) => {
          const pulse = reducedMotion ? 1 : THREE.MathUtils.clamp((selectedAgeMs - index * 180) / 980, 0, 1);
          const opacity = Math.sin(pulse * Math.PI) * (index ? .34 : .5);
          ring.visible = opacity > .01;
          ring.scale.setScalar(.82 + pulse * 2.4);
          ring.material.opacity = opacity;
        });
        const spinGroup = selectionRef.current.userData.spinGroup as THREE.Group | undefined;
        if (spinGroup && !reducedMotion) {
          spinGroup.rotation.y = rayTime * 2.4;
          spinGroup.rotation.z = Math.sin(rayTime * 6.8) * .025 + rock * .035;
          renderFramesRef.current = Math.max(renderFramesRef.current, 2);
        }
      }
      const revealEase = reducedMotion ? 1 : 1 - Math.exp(-10 * delta);
      const hoveredCountry = hoveredCountryRef.current;
      const zoomReveal = mealMode ? 0 : THREE.MathUtils.clamp((5.08 - camera.position.z) / 2.45, 0, 1);
      const hoverPoint = hoveredPointLocalRef.current;
      const hoverWorld = hoverPoint ? group.localToWorld(hoverPoint.clone()) : null;
      const hoverScreen = hoverWorld ? hoverWorld.clone().project(camera) : null;
      countryLinesRef.current.forEach((line) => {
        const material = line.material as THREE.LineBasicMaterial;
        const center = line.geometry.boundingSphere?.center;
        let localStrength = 0;
        if (center && hoverScreen) {
          const worldCenter = group.localToWorld(center.clone());
          const screenCenter = worldCenter.project(camera);
          const distance = Math.hypot(screenCenter.x - hoverScreen.x, screenCenter.y - hoverScreen.y);
          // Use a fixed screen-space falloff so large countries do not turn
          // the hover treatment into a full-outline glow.
          localStrength = THREE.MathUtils.clamp(1 - distance / .22, 0, 1);
        }
        const sameCountry = Boolean(hoveredCountry && line.userData.countryKey === hoveredCountry);
        const opacity = Math.max(zoomReveal * .34, sameCountry ? localStrength * .62 : localStrength * .42);
        material.opacity += (opacity - material.opacity) * revealEase;
        if (Math.abs(opacity - material.opacity) > .003) renderFramesRef.current = Math.max(renderFramesRef.current, 2);
        line.visible = material.opacity > .008;
      });
      // Avoid projecting every city sprite while the cities are hidden at the
      // normal overview zoom. This is a sizeable CPU saving on pointer drags.
      const labelsVisible = zoomReveal > .001 || Boolean(hoveredCountry) || cityLabelsRef.current.some(label => (label.material as THREE.SpriteMaterial).opacity > .01);
      if (labelsVisible) {
        const occupied: { x: number; y: number; width: number }[] = [];
        cityLabelsRef.current.forEach((label) => {
          const material = label.material as THREE.SpriteMaterial;
          worldPosition.copy(label.position).applyMatrix4(group.matrixWorld);
          const facingCamera = worldPosition.z > (1.466 * 1.466) / camera.position.z + .035;
          const matchesHover = Boolean(hoveredCountry && label.userData.countryKey === hoveredCountry);

          const distance = camera.position.z - worldPosition.z;
          const unit = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / mount.clientHeight;
          const width = label.userData.labelWidth * .5;
          label.scale.set(width * unit, 26 * unit, 1);
          worldPosition.project(camera);
          const localStrength = hoverScreen ? THREE.MathUtils.clamp(1 - Math.hypot(worldPosition.x - hoverScreen.x, worldPosition.y - hoverScreen.y) / .22, 0, 1) : 0;
          const reveal = Math.max(zoomReveal * .85, localStrength * (matchesHover ? 1 : .68));
          const eligible = facingCamera && reveal > .01;
          const x = (worldPosition.x + 1) * mount.clientWidth / 2;
          const y = (1 - worldPosition.y) * mount.clientHeight / 2;
          const behindControl = !panelsHidden && labelExclusions.some(r => x + width / 2 > r.left && x - width / 2 < r.right && y > r.top - 8 && y < r.bottom + 28);
          const clear = eligible && !behindControl && !occupied.some(p => Math.abs(p.x - x) < (p.width + width) / 2 + 8 && Math.abs(p.y - y) < 30);
          if (clear) occupied.push({ x, y, width });
          const targetOpacity = clear ? reveal : 0;
          material.opacity += (targetOpacity - material.opacity) * revealEase;
          // Occlusion must remain immediate so text cannot float over the back
          // of the Earth or over controls while its visibility fades.
          if (!facingCamera || behindControl) material.opacity = 0;
          else if (Math.abs(targetOpacity - material.opacity) > .003) renderFramesRef.current = Math.max(renderFramesRef.current, 2);
          label.visible = material.opacity > .01;
        });
      }
      renderer.render(scene, camera);
    };
    render();
    const resize = () => {
      const bounds = mount.getBoundingClientRect();
      labelExclusions = Array.from(mount.closest(".ss-destination")?.querySelectorAll(".ss-destination-copy,.ss-destination-summary") || []).map(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left - bounds.left, right: rect.right - bounds.left, top: rect.top - bounds.top, bottom: rect.bottom - bounds.top };
      });
      const width = mount.clientWidth, height = mount.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.fov = globeViewport(width, height, compactViewport.matches).fov;
      camera.setViewOffset(width, height, compactViewport.matches ? 0 : width > 600 ? -width * .04 : 0, compactViewport.matches ? 0 : -height * .09, width, height);
      camera.updateProjectionMatrix();
      renderFramesRef.current = 18;
    };
    const observer = new ResizeObserver(resize);
    resize();
    observer.observe(mount);
    return () => {
      disposed = true;
      clearTimeout(panelTimer);
      destinationScene?.removeEventListener("input", revealPanels);
      destinationScene?.removeEventListener("keydown", revealPanels);
      destinationScene?.removeEventListener("focusin", revealPanels);
      destinationScene?.removeEventListener("focusout", revealPanels);
      destinationScene?.classList.remove("is-globe-immersive");
      destinationScene?.style.removeProperty("--panel-progress");
      panels.forEach(panel => panel.removeAttribute("aria-hidden"));
      destinationScene?.style.removeProperty("--sun-turn");
      destinationScene?.style.removeProperty("--sun-scale");
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
      mount.removeEventListener("wheel", handleNativeWheel);
      window.removeEventListener("blur", stopDrag);
      stopDrag();
      cityLabels.forEach((label) => {
        label.material.map?.dispose();
        label.material.dispose();
      });
      cityLabelsRef.current = [];
      countryLinesRef.current = [];
      hoveredPointLocalRef.current = null;
      selectionRef.current?.traverse(object => {
        if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); }
      });
      selectionRef.current = null;
      sunRays.geometry.dispose();
      sunRays.material.dispose();
      sun.geometry.dispose();
      sun.material.dispose();
      corona.geometry.dispose();
      corona.material.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      renderer.dispose();
      clouds.geometry.dispose();
      clouds.material.alphaMap?.dispose();
      clouds.material.dispose();
      atmosphere.geometry.dispose();
      atmosphere.material.dispose();
      globe.geometry.dispose();
      const globeMaterial = globe.material as THREE.MeshPhongMaterial;
      globeMaterial.map?.dispose();
      globeMaterial.normalMap?.dispose();
      globeMaterial.specularMap?.dispose();
      globeMaterial.dispose();
      group.traverse(object => { if (object instanceof THREE.Line) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } });
      mount.replaceChildren();
    };
  }, [reducedMotion]);

  // Change the camera target without rebuilding the renderer or losing Earth orientation.
  useEffect(() => {
    presentationRef.current = presentation;
    if (presentation === "meal") {
      destinationZoomRef.current ??= zoomTargetRef.current;
      zoomTargetRef.current = 3.55;
      const renderedRotation = globeGroupRef.current?.rotation;
      if (renderedRotation) {
        // Begin from the exact displayed orientation instead of finishing an
        // older destination target during the scene handoff.
        rotationTargetRef.current.copy(renderedRotation);
      }
      mealTiltRef.current = { base: renderedRotation?.x ?? rotationTargetRef.current.x, elapsed: 0 };
      hoveredCountryRef.current = null;
      hoveredPointLocalRef.current = null;
      draggingRef.current.active = false;
    } else if (destinationZoomRef.current !== null) {
      zoomTargetRef.current = destinationZoomRef.current;
      destinationZoomRef.current = null;
      const selectedCoordinates = selectedCoordinatesRef.current;
      const renderedRotation = globeGroupRef.current?.rotation;
      if (selectedCoordinates && renderedRotation) {
        const destination = locationRotationFromCoordinates(selectedCoordinates.longitude, selectedCoordinates.latitude);
        rotationTargetRef.current.x = destination.x;
        rotationTargetRef.current.y = renderedRotation.y + THREE.MathUtils.euclideanModulo(destination.y - renderedRotation.y + Math.PI, Math.PI * 2) - Math.PI;
      }
    }
    const camera = cameraRef.current;
    if (camera) cameraTransitionRef.current = { from: camera.position.z, to: zoomTargetRef.current, elapsed: 0 };
    renderFramesRef.current = 90;
  }, [presentation, reducedMotion]);

  useEffect(() => {
    const group = globeGroupRef.current;
    if (!group || !location.trim()) return;
    if (skipLocationRotationRef.current) {
      skipLocationRotationRef.current = false;
      return;
    }
    // Typing a partial place name must not spin the scene to a random target.
    const timer = setTimeout(() => {
      const resolvedLocation = resolveLocationTarget(location, countriesRef.current, countryCentersRef.current);
      if (!resolvedLocation) return;
      const destination = locationRotationFromCoordinates(resolvedLocation.longitude, resolvedLocation.latitude);
      rotationTargetRef.current.x = destination.x;
      rotationTargetRef.current.y = group.rotation.y + THREE.MathUtils.euclideanModulo(destination.y - group.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
      renderFramesRef.current = 30;
    }, 300);
    return () => clearTimeout(timer);
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
    if (selectionRef.current) {
      selectionRef.current.traverse(object => {
        if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); }
      });
      selectionRef.current.removeFromParent();
    }
    const localPoint = group.worldToLocal(hit.point.clone()).normalize();
    const marker = new THREE.Group();
    // A small, camera-facing map pin retains its pointed silhouette from above.
    const silhouette = new THREE.Shape();
    silhouette.moveTo(0, 0);
    silhouette.bezierCurveTo(-.010, .018, -.029, .035, -.029, .054);
    silhouette.bezierCurveTo(-.029, .092, .029, .092, .029, .054);
    silhouette.bezierCurveTo(.029, .035, .010, .018, 0, 0);
    const hole = new THREE.Path();
    hole.absarc(0, .055, .010, 0, Math.PI * 2, true);
    silhouette.holes.push(hole);
    const face = new THREE.Mesh(new THREE.ExtrudeGeometry(silhouette, { depth: .018, bevelEnabled: true, bevelThickness: .003, bevelSize: .003, bevelSegments: 3, steps: 1, curveSegments: 24 }), new THREE.MeshPhongMaterial({ color: 0xffb77c, emissive: 0x6a2910, emissiveIntensity: .25, shininess: 65, specular: 0xffe6bc }));
    const spinGroup = new THREE.Group();
    spinGroup.add(face);
    marker.add(spinGroup);
    const pulseRings = [0, 1].map(() => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(.032, .043, 48),
        new THREE.MeshBasicMaterial({ color: 0xffd39a, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      ring.position.z = -.01;
      ring.visible = false;
      marker.add(ring);
      return ring;
    });
    marker.position.copy(localPoint.clone().multiplyScalar(1.478));
    marker.userData.billboard = true;
    marker.quaternion.copy(group.quaternion).invert().multiply(camera.quaternion);
    marker.scale.setScalar(.55);
    marker.userData.baseScale = new THREE.Vector3(.55, .55, .55);
    marker.userData.basePosition = marker.position.clone();
    marker.userData.bornAt = performance.now();
    marker.userData.pulseRings = pulseRings;
    marker.userData.spinGroup = spinGroup;
    group.add(marker);
    selectionRef.current = marker;
    const normal = marker.position.clone().normalize();
    const latitude = 90 - (Math.acos(normal.y) * 180) / Math.PI;
    let longitude = (Math.atan2(normal.z, -normal.x) * 180) / Math.PI - 180;
    if (longitude < -180) longitude += 360;
    selectedCoordinatesRef.current = { longitude, latitude };
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
    renderFramesRef.current = 30;
    const destination = locationRotationFromCoordinates(longitude, latitude);
    rotationTargetRef.current.x = destination.x;
    rotationTargetRef.current.y = group.rotation.y + THREE.MathUtils.euclideanModulo(destination.y - group.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
    hoveredCountryRef.current = null;
    hoveredPointLocalRef.current = null;
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
    if (!hit) { hoveredPointLocalRef.current = null; return null; }
    const localPoint = group.worldToLocal(hit.point.clone()).normalize();
    hoveredPointLocalRef.current = localPoint.clone();
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
    if (presentationRef.current === "meal") return;
    if (event.button === 0 && event.pointerType !== "touch") { selectPoint(event); return; }
    if (event.button !== 2 && event.pointerType !== "touch") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.pointerType === "touch") {
      touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchesRef.current.size > 1) {
        const [a, b] = [...touchesRef.current.values()];
        pinchDistanceRef.current = Math.hypot(a.x - b.x, a.y - b.y);
        pinchCenterRef.current = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        draggingRef.current.moved = true;
        return;
      }
    }
    const drag = draggingRef.current;
    drag.active = true; drag.x = event.clientX; drag.y = event.clientY;
    drag.startX = event.clientX; drag.startY = event.clientY; drag.moved = false; drag.touch = event.pointerType === "touch";
  }
  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = draggingRef.current;
    const group = globeGroupRef.current;
    if (event.pointerType === "touch") {
      if (!touchesRef.current.has(event.pointerId)) return;
      touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchesRef.current.size > 1) {
        const [a, b] = [...touchesRef.current.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const previousCenter = pinchCenterRef.current;
        if (previousCenter) rotateByDelta(center.x - previousCenter.x, center.y - previousCenter.y);
        pinchCenterRef.current = center;
        if (distance > 0 && pinchDistanceRef.current > 0) {
          cameraTransitionRef.current = null;
          zoomTargetRef.current = THREE.MathUtils.clamp(zoomTargetRef.current * pinchDistanceRef.current / distance, MIN_ZOOM, MAX_ZOOM);
          renderFramesRef.current = 30;
        }
        pinchDistanceRef.current = distance;
        drag.moved = true;
        return;
      }
    }
    if (!drag.active || !group) {
      const now = event.timeStamp;
      if (now - lastHoverSampleRef.current < 50) return;
      lastHoverSampleRef.current = now;
      const country = hoveredPointCountry(event);
      renderFramesRef.current = 18;
      hoveredCountryRef.current = country;
      return;
    }
    const dx = event.clientX - drag.x; const dy = event.clientY - drag.y;
    drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6;
    rotateByDelta(dx, dy);
    drag.x = event.clientX; drag.y = event.clientY;
  }
  function rotateByDelta(dx: number, dy: number) {
    renderFramesRef.current = 30;
    // Surface distance, not center distance, keeps drag speed proportional
    // to the visible ground as the camera approaches the Earth.
    const camera = cameraRef.current;
    const surfaceDistance = Math.max(.1, (camera?.position.z ?? 5.1) - 1.45);
    const adjustedDistance = Math.sqrt(surfaceDistance * 4.5);
    const radiansPerPixel = camera && mountRef.current
      ? 2 * adjustedDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / (1.45 * Math.max(1, mountRef.current.clientHeight))
      : .004;
    rotationTargetRef.current.y += dx * radiansPerPixel;
    rotationTargetRef.current.x = Math.max(-1.25, Math.min(1.25, rotationTargetRef.current.x + dy * radiansPerPixel));
  }
  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = draggingRef.current;
    touchesRef.current.delete(event.pointerId);
    pinchDistanceRef.current = 0;
    pinchCenterRef.current = null;
    if (touchesRef.current.size > 1) {
      const [a, b] = [...touchesRef.current.values()];
      pinchDistanceRef.current = Math.hypot(a.x - b.x, a.y - b.y);
      pinchCenterRef.current = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const remaining = touchesRef.current.values().next().value;
    if (remaining) {
      // Resume a one-finger drag without jumping or treating a pinch as a tap.
      drag.x = remaining.x; drag.y = remaining.y; drag.moved = true;
      return;
    }
    if (drag.active && drag.touch && !drag.moved && event.type === "pointerup") selectPoint(event);
    drag.active = false;
  }

  return <div className={`interactive-globe-wrap ${textureReady ? "is-texture-ready" : "is-texture-loading"}`}>
    <div ref={mountRef} className="interactive-globe-canvas" onContextMenu={(event) => event.preventDefault()} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerLeave={() => { hoveredCountryRef.current = null; hoveredPointLocalRef.current = null; renderFramesRef.current = 18; }} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} role="img" aria-label={presentation === "meal" ? "Slowly rotating Earth behind the meal carousel" : "Interactive 3D Earth. Scroll to zoom. Hold the right mouse button and drag to rotate. Left-click to select. On touchscreens, pinch to zoom, drag to rotate and tap to select."} />
    {location.trim() && <div className="globe-location-readout"><span>Destination</span><strong>{location}</strong></div>}
    {selected && <div className="globe-interaction-hint" role="status"><span>Selected destination</span><strong>{selected}</strong></div>}
    <a className="globe-image-credit" href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer">Earth: NASA · Clouds: Solar System Scope / CC BY 4.0</a>
  </div>;
}
