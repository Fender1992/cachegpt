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
      'fahrenheit', 'celsius', 'umbrella', 'jacket', 'what to wear'
    ];

    const lowerMessage = message.toLowerCase();
    const needsWeather = keywords.some(keyword => lowerMessage.includes(keyword));

    if (needsWeather) {
      console.log('[WEATHER] Query needs weather context:', message);
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
      // "in Kansas City", "at KCMO", "for Boston"
      /(?:in|at|for)\s+([A-Z][A-Z,\.\s]+?)(?:\s+(?:weather|temperature|forecast)|[,\.\?]|$)/i,
      // "weather in Kansas City"
      /weather\s+(?:in|at|for)\s+([A-Z][A-Z,\.\s]+?)(?:\s|[,\.\?]|$)/i,
      // "Kansas City weather"
      /^([A-Z][A-Za-z,\.\s]+?)\s+(?:weather|temperature|forecast)/i,
      // "What's the weather in KCMO"
      /(?:what'?s|what is)\s+the\s+(?:weather|temperature)\s+(?:in|at|for)\s+([A-Z][A-Z,\.\s]+?)(?:\s|[,\.\?]|$)/i,
      // Catch city names with abbreviations like "KCMO", "NYC", "SF"
      /(?:in|at|for)\s+([A-Z]{2,})/,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        const location = match[1].trim();
        console.log('[WEATHER] Extracted location:', location);
        return location;
      }
    }

    // Default to a major city if no location found
    console.log('[WEATHER] No location found, using default: New York');
    return 'New York';
  }

  /**
   * Get coordinates for a location using Open-Meteo geocoding
   */
  private async geocodeLocation(location: string): Promise<{ lat: number; lon: number; name: string } | null> {
    try {
      console.log('[WEATHER] Geocoding location:', location);
      const response = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
        params: {
          name: location,
          count: 1,
          language: 'en',
          format: 'json'
        },
        timeout: 5000
      });

      if (response.data.results && response.data.results.length > 0) {
        const result = response.data.results[0];
        const coords = {
          lat: result.latitude,
          lon: result.longitude,
          name: result.name + (result.admin1 ? `, ${result.admin1}` : '') + (result.country ? `, ${result.country}` : '')
        };
        console.log('[WEATHER] Geocoded to:', coords.name, `(${coords.lat}, ${coords.lon})`);
        return coords;
      }

      console.log('[WEATHER] No geocoding results for:', location);
      return null;
    } catch (error: any) {
      console.error('[WEATHER] Geocoding error:', error.message);
      return null;
    }
  }

  /**
   * Fetch from Open-Meteo (FREE - no API key required)
   */
  private async fetchOpenMeteo(lat: number, lon: number, locationName: string): Promise<WeatherResult> {
    try {
      console.log('[WEATHER] Fetching weather from Open-Meteo for:', locationName);
      const response = await axios.get('https://api.open-meteo.com/v1/forecast', {
        params: {
          latitude: lat,
          longitude: lon,
          current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
          hourly: 'temperature_2m,weather_code',
          temperature_unit: 'fahrenheit',
          wind_speed_unit: 'mph',
          forecast_days: 3,
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

      // Get next 24 hours forecast (simplified)
      const forecast: WeatherData[] = [];
      if (data.hourly && data.hourly.time) {
        for (let i = 0; i < Math.min(24, data.hourly.time.length); i += 3) {
          forecast.push({
            location: locationName,
            temperature: Math.round(data.hourly.temperature_2m[i]),
            conditions: this.mapWeatherCode(data.hourly.weather_code[i]),
            timestamp: data.hourly.time[i],
            source: 'Open-Meteo'
          });
        }
      }

      return {
        current,
        forecast: forecast.slice(0, 8), // Next 24 hours in 3-hour intervals
        sources: ['Open-Meteo']
      };
    } catch (error: any) {
      console.error('Open-Meteo error:', error.message);
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
      console.error('OpenWeatherMap error:', error.message);
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
      context += `Forecast (next 24 hours):\n`;
      weatherResult.forecast.forEach((forecast, index) => {
        const time = new Date(forecast.timestamp).toLocaleString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        context += `  ${time}: ${forecast.temperature}°F, ${forecast.conditions}\n`;
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
      console.log('[WEATHER] Fetching weather data...');
      const weatherResult = await this.fetchWeather(userMessage);
      const context = this.formatWeatherContext(weatherResult);

      if (context) {
        console.log('[WEATHER] Weather context added:', context.substring(0, 200) + '...');
      } else {
        console.log('[WEATHER] No weather data available');
      }

      return context;
    } catch (error: any) {
      console.error('[WEATHER] Error fetching weather context:', error.message);
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
