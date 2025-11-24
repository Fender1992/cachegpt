import axios from 'axios';

interface WeatherData {
  location: string;
  temperature: number;
  feelsLike?: number;
  conditions: string;
  humidity?: number;
  windSpeed?: number;
  timestamp: string;
  source: string;
}

interface WeatherResult {
  current?: WeatherData;
  forecast?: WeatherData[];
  sources: string[];
}

/**
 * Weather Service - Aggregates weather from multiple APIs
 * Primary: Open-Meteo (no API key required)
 * Fallback: OpenWeatherMap (requires API key)
 */
export class WeatherService {
  private openWeatherApiKey: string;

  constructor() {
    this.openWeatherApiKey = process.env.OPENWEATHER_API_KEY || '';
  }

  /**
   * Check if user query needs weather context
   */
  needsWeatherContext(message: string): boolean {
    const keywords = [
      'weather', 'temperature', 'forecast', 'rain', 'snow', 'sunny',
      'cloudy', 'cold', 'hot', 'warm', 'climate', 'humidity',
      'wind', 'storm', 'precipitation', 'conditions', 'degrees',
      'fahrenheit', 'celsius', 'umbrella', 'jacket', 'what to wear',
      'going to be', 'will it', 'should i', 'do i need'
    ];

    const lowerMessage = message.toLowerCase();
    const needsWeather = keywords.some(keyword => lowerMessage.includes(keyword));

    // Temporary debug logging to diagnose issue
    if (needsWeather) {
      console.log('[WEATHER-DEBUG] Query detected as needing weather:', message.substring(0, 100));
    } else {
      console.log('[WEATHER-DEBUG] Query does NOT need weather:', message.substring(0, 100));
    }

    return needsWeather;
  }

  /**
   * Extract location from user message
   * Returns default location if none found
   */
  private extractLocation(message: string): string {
    // Try to find patterns like "in [location]", "at [location]", "[location] weather"
    const patterns = [
      // "in Kansas City", "at KCMO", "for Boston", "in fredericksburg va"
      /(?:in|at|for)\s+([a-z][a-z,\.\s]+?)(?:\s+(?:weather|temperature|forecast|this\s+week)|[,\.\?]|$)/i,
      // "weather in Kansas City"
      /weather\s+(?:in|at|for)\s+([a-z][a-z,\.\s]+?)(?:\s|[,\.\?]|$)/i,
      // "Kansas City weather", "fredericksburg weather"
      /^([a-z][a-z,\.\s]+?)\s+(?:weather|temperature|forecast)/i,
      // "What's the weather in KCMO" or "going to be in fredericksburg"
      /(?:what'?s|what is|going to be)\s+(?:the\s+)?(?:weather|temperature|forecast)?(?:\s+like)?(?:\s+in|at|for)\s+([a-z][a-z,\.\s]+?)(?:\s+this\s+week|\s|[,\.\?]|$)/i,
      // Catch city names with abbreviations like "KCMO", "NYC", "SF"
      /(?:in|at|for)\s+([A-Z]{2,})/,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        const location = match[1].trim();
        console.log('[WEATHER-DEBUG] Extracted location:', location);
        return location;
      }
    }

    // Default to a major city if no location found
    console.log('[WEATHER-DEBUG] No location found, using default: New York');
    return 'New York';
  }

  /**
   * Get coordinates for a location using Open-Meteo geocoding
   */
  private async geocodeLocation(location: string): Promise<{ lat: number; lon: number; name: string } | null> {
    try {
      console.log('[WEATHER-DEBUG] Geocoding location:', location);
      const response = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
        params: {
          name: location,
          count: 1,
          language: 'en',
          format: 'json'
        },
        timeout: 10000 // Increased to 10 seconds
      });
      console.log('[WEATHER-DEBUG] Geocoding response received:', response.data.results?.length || 0, 'results');

      if (response.data.results && response.data.results.length > 0) {
        const result = response.data.results[0];
        return {
          lat: result.latitude,
          lon: result.longitude,
          name: result.name + (result.admin1 ? `, ${result.admin1}` : '') + (result.country ? `, ${result.country}` : '')
        };
      }

      console.log('[WEATHER-DEBUG] Geocoding found no results for:', location);
      return null;
    } catch (error: any) {
      console.log('[WEATHER-DEBUG] Geocoding error:', error.message);
      return null;
    }
  }

  /**
   * Fetch from Open-Meteo (FREE - no API key required)
   */
  private async fetchOpenMeteo(lat: number, lon: number, locationName: string): Promise<WeatherResult> {
    try {
      const response = await axios.get('https://api.open-meteo.com/v1/forecast', {
        params: {
          latitude: lat,
          longitude: lon,
          current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
          daily: 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max',
          temperature_unit: 'fahrenheit',
          wind_speed_unit: 'mph',
          precipitation_unit: 'inch',
          forecast_days: 7,
          timezone: 'auto'
        },
        timeout: 5000
      });

      const data = response.data;

      // Map weather codes to conditions
      const weatherCode = data.current.weather_code;
      const conditions = this.mapWeatherCode(weatherCode);

      const current: WeatherData = {
        location: locationName,
        temperature: Math.round(data.current.temperature_2m),
        feelsLike: Math.round(data.current.apparent_temperature),
        conditions: conditions,
        humidity: data.current.relative_humidity_2m,
        windSpeed: Math.round(data.current.wind_speed_10m),
        timestamp: new Date().toISOString(),
        source: 'Open-Meteo'
      };

      // Get 7-day forecast
      const forecast: WeatherData[] = [];
      if (data.daily && data.daily.time) {
        for (let i = 0; i < data.daily.time.length; i++) {
          forecast.push({
            location: locationName,
            temperature: Math.round(data.daily.temperature_2m_max[i]),
            feelsLike: Math.round(data.daily.temperature_2m_min[i]), // Using min temp in feelsLike field
            conditions: this.mapWeatherCode(data.daily.weather_code[i]),
            humidity: data.daily.precipitation_probability_max?.[i], // Using humidity field for precipitation chance
            timestamp: data.daily.time[i],
            source: 'Open-Meteo'
          });
        }
      }

      return {
        current,
        forecast, // 7-day forecast
        sources: ['Open-Meteo']
      };
    } catch (error: any) {
      console.log('[WEATHER-DEBUG] Open-Meteo API error:', error.message);
      return { sources: [] };
    }
  }

  /**
   * Map Open-Meteo weather codes to readable conditions
   */
  private mapWeatherCode(code: number): string {
    const codeMap: { [key: number]: string } = {
      0: 'Clear sky',
      1: 'Mainly clear',
      2: 'Partly cloudy',
      3: 'Overcast',
      45: 'Foggy',
      48: 'Depositing rime fog',
      51: 'Light drizzle',
      53: 'Moderate drizzle',
      55: 'Dense drizzle',
      61: 'Slight rain',
      63: 'Moderate rain',
      65: 'Heavy rain',
      71: 'Slight snow',
      73: 'Moderate snow',
      75: 'Heavy snow',
      77: 'Snow grains',
      80: 'Slight rain showers',
      81: 'Moderate rain showers',
      82: 'Violent rain showers',
      85: 'Slight snow showers',
      86: 'Heavy snow showers',
      95: 'Thunderstorm',
      96: 'Thunderstorm with slight hail',
      99: 'Thunderstorm with heavy hail'
    };

    return codeMap[code] || 'Unknown';
  }

  /**
   * Fetch from OpenWeatherMap (Fallback - requires API key)
   */
  private async fetchOpenWeatherMap(location: string): Promise<WeatherResult> {
    if (!this.openWeatherApiKey) return { sources: [] };

    try {
      const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
        params: {
          q: location,
          appid: this.openWeatherApiKey,
          units: 'imperial'
        },
        timeout: 5000
      });

      const data = response.data;

      const current: WeatherData = {
        location: `${data.name}, ${data.sys.country}`,
        temperature: Math.round(data.main.temp),
        feelsLike: Math.round(data.main.feels_like),
        conditions: data.weather[0].description,
        humidity: data.main.humidity,
        windSpeed: Math.round(data.wind.speed),
        timestamp: new Date().toISOString(),
        source: 'OpenWeatherMap'
      };

      return {
        current,
        sources: ['OpenWeatherMap']
      };
    } catch (error: any) {
      console.log('[WEATHER-DEBUG] OpenWeatherMap API error:', error.message);
      return { sources: [] };
    }
  }

  /**
   * Get weather data with fallback strategy
   */
  async fetchWeather(userMessage: string): Promise<WeatherResult> {
    const location = this.extractLocation(userMessage);

    // Try Open-Meteo first (free, no API key)
    const coords = await this.geocodeLocation(location);

    if (coords) {
      const openMeteoResult = await this.fetchOpenMeteo(coords.lat, coords.lon, coords.name);
      if (openMeteoResult.current) {
        return openMeteoResult;
      }
    }

    // Fallback to OpenWeatherMap if available
    if (this.openWeatherApiKey) {
      const owmResult = await this.fetchOpenWeatherMap(location);
      if (owmResult.current) {
        return owmResult;
      }
    }

    return { sources: [] };
  }

  /**
   * Format weather data for LLM context
   */
  formatWeatherContext(weatherResult: WeatherResult): string {
    if (!weatherResult.current) {
      return '';
    }

    const timestamp = new Date().toISOString();
    let context = `\n\n=== REAL-TIME WEATHER DATA (${timestamp}) ===\n`;
    context += `Sources: ${weatherResult.sources.join(', ')}\n\n`;

    const current = weatherResult.current;
    context += `Current conditions for ${current.location}:\n`;
    context += `  Temperature: ${current.temperature}°F`;
    if (current.feelsLike) {
      context += ` (feels like ${current.feelsLike}°F)`;
    }
    context += `\n`;
    context += `  Conditions: ${current.conditions}\n`;
    if (current.humidity) {
      context += `  Humidity: ${current.humidity}%\n`;
    }
    if (current.windSpeed) {
      context += `  Wind Speed: ${current.windSpeed} mph\n`;
    }
    context += `\n`;

    if (weatherResult.forecast && weatherResult.forecast.length > 0) {
      context += `7-Day Forecast:\n`;
      weatherResult.forecast.forEach((forecast, index) => {
        const date = new Date(forecast.timestamp);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const highTemp = forecast.temperature;
        const lowTemp = forecast.feelsLike; // We stored min temp here
        const precipChance = forecast.humidity; // We stored precip chance here

        context += `  ${dayName}, ${dateStr}: High ${highTemp}°F, Low ${lowTemp}°F, ${forecast.conditions}`;
        if (precipChance && precipChance > 0) {
          context += `, ${precipChance}% chance of precipitation`;
        }
        context += `\n`;
      });
      context += `\n`;
    }

    context += '=== END WEATHER DATA ===\n\n';
    context += 'Instructions: Use the above real-time weather data to provide accurate, current weather information. ';
    context += 'When discussing weather conditions, refer to this data. ';
    context += 'If asked about what to wear or outdoor activities, consider the temperature and conditions.\n';

    return context;
  }

  /**
   * Get weather context if needed for the query
   */
  async getWeatherContextIfNeeded(userMessage: string): Promise<string> {
    if (!this.needsWeatherContext(userMessage)) {
      return '';
    }

    try {
      console.log('[WEATHER-DEBUG] Fetching weather for query...');
      const weatherResult = await this.fetchWeather(userMessage);
      const context = this.formatWeatherContext(weatherResult);

      if (context) {
        console.log('[WEATHER-DEBUG] Weather context generated:', context.length, 'chars');
        console.log('[WEATHER-DEBUG] First 200 chars:', context.substring(0, 200));
      } else {
        console.log('[WEATHER-DEBUG] No weather context generated (empty result)');
      }

      return context;
    } catch (error: any) {
      console.log('[WEATHER-DEBUG] Error fetching weather:', error.message);
      return '';
    }
  }
}

// Singleton instance
let weatherServiceInstance: WeatherService | null = null;

export function getWeatherService(): WeatherService {
  if (!weatherServiceInstance) {
    weatherServiceInstance = new WeatherService();
  }
  return weatherServiceInstance;
}
