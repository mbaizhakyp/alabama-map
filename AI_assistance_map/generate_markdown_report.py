#!/usr/bin/env python3
"""
Markdown Report Generator for Flood Query Results

This module generates well-formatted Markdown reports from flood query results.
"""

import json
import os
from datetime import datetime


class FloodMarkdownGenerator:
    """
    Generates Markdown reports for flood query results.
    """

    def __init__(self, output_dir="results"):
        """
        Initialize the Markdown generator.

        Args:
            output_dir: Directory to save Markdown reports
        """
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    def generate_report(self, result_data, output_filename=None):
        """
        Generate a Markdown report from query results.

        Args:
            result_data: Dictionary containing query results
            output_filename: Optional custom filename

        Returns:
            Path to the generated Markdown file
        """
        if output_filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_filename = f"flood_report_{timestamp}.md"

        output_path = os.path.join(self.output_dir, output_filename)

        # Build Markdown content
        md_content = []

        # Add header
        md_content.append(self._create_header(result_data))

        # Add query and answer
        md_content.append(self._create_query_section(result_data))

        # Add location information
        if 'filtered_context' in result_data:
            filtered_data = result_data['filtered_context'].get('filtered_data', [])
            for location_data in filtered_data:
                md_content.append(self._create_location_section(location_data))

        # Add metadata footer
        md_content.append(self._create_metadata_section(result_data))

        # Write to file
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write('\n\n'.join(md_content))

        return output_path

    def _create_header(self, result_data):
        """Create report header."""
        date_text = datetime.now().strftime('%B %d, %Y at %I:%M %p')

        header = f"""# 🌊 Flood Information Report

**Generated:** {date_text}

---
"""
        return header

    def _create_query_section(self, result_data):
        """Create the query and answer section."""
        query = result_data.get('query', 'N/A')
        answer = result_data.get('answer', 'No answer generated.')

        section = f"""## 🔍 Query

> **"{query}"**

## 💡 Answer

{answer}

---
"""
        return section

    def _create_location_section(self, location_data):
        """Create detailed section for a specific location."""
        sections = []

        # Location header
        input_loc = location_data.get('input_location', {})
        loc_name = input_loc.get('name', 'Unknown Location')
        formatted_address = input_loc.get('formatted_address', 'N/A')
        lat = input_loc.get('latitude', 'N/A')
        lng = input_loc.get('longitude', 'N/A')

        sections.append(f"""## 📍 Location: {loc_name}

**Address:** {formatted_address}
**Coordinates:** {lat}, {lng}
""")

        # County information
        if 'county_data' in location_data:
            sections.append(self._create_county_section(location_data['county_data']))

        # Flood event history
        if 'flood_event_history' in location_data:
            sections.append(self._create_flood_events_section(location_data['flood_event_history']))

        # SVI data
        if 'social_vulnerability_index' in location_data:
            sections.append(self._create_svi_section(location_data['social_vulnerability_index']))

        # Precipitation forecast
        if 'precipitation_forecast' in location_data and location_data['precipitation_forecast']:
            sections.append(self._create_precipitation_forecast_section(location_data['precipitation_forecast']))

        # Precipitation history
        if 'precipitation_history' in location_data and location_data['precipitation_history']:
            sections.append(self._create_precipitation_history_section(location_data['precipitation_history']))

        return '\n\n'.join(sections)

    def _create_county_section(self, county_data):
        """Create county information section."""
        county_name = county_data.get('county_name', 'N/A')
        state_name = county_data.get('state_name', 'N/A')
        fips_code = county_data.get('fips_code', 'N/A')
        area_sqmi = county_data.get('area_sqmi', 0)

        section = f"""### 🏛️ County Information

| Field | Value |
|-------|-------|
| **County** | {county_name} |
| **State** | {state_name} |
| **FIPS Code** | {fips_code} |
| **Area (sq mi)** | {area_sqmi:.2f} |
"""
        return section

    def _create_flood_events_section(self, flood_events):
        """Create flood events table."""
        count = len(flood_events)

        section = f"""### 🌊 Historical Flood Events ({count} events)

"""
        if not flood_events:
            section += "*No flood events recorded.*\n"
            return section

        # Create table header
        section += "| Date | Type | Distance (mi) | Warning Zone | Nearest Address |\n"
        section += "|------|------|---------------|--------------|----------------|\n"

        # Add events (limit to 15 for readability)
        for event in flood_events[:15]:
            date = event.get('date', 'N/A')
            event_type = event.get('type', 'N/A')
            distance = event.get('distance_from_query_point_miles', 0)
            zone = event.get('warning_zone', 'N/A')
            address = event.get('nearest_address', 'N/A')

            # Truncate long addresses
            if len(address) > 50:
                address = address[:47] + "..."

            section += f"| {date} | {event_type} | {distance:.2f} | {zone} | {address} |\n"

        if count > 15:
            section += f"\n*Showing 15 of {count} total events*\n"

        return section

    def _create_svi_section(self, svi_data):
        """Create SVI data section."""
        sections = []

        sections.append("### 📊 Social Vulnerability Index (SVI)\n")

        # Overall rankings
        overall = svi_data.get('overall_ranking', {})
        national = overall.get('national')
        state = overall.get('state')

        if national is not None or state is not None:
            sections.append("#### Overall Rankings\n")
            sections.append("| Ranking Type | Percentile |")
            sections.append("|--------------|------------|")
            if national is not None:
                sections.append(f"| **National** | {national:.2f} |")
            if state is not None:
                sections.append(f"| **State** | {state:.2f} |")
            sections.append("")

        # Theme rankings
        themes = svi_data.get('themes', {})
        if themes:
            sections.append("#### Theme Rankings\n")
            sections.append("| Theme | Percentile |")
            sections.append("|-------|------------|")
            for theme_name, theme_value in themes.items():
                value_str = f"{theme_value:.2f}" if theme_value is not None else 'N/A'
                sections.append(f"| {theme_name} | {value_str} |")
            sections.append("")

        # Variable data
        variables = svi_data.get('variables', {})
        if variables:
            sections.append(f"#### Key Variables ({len(variables)} selected)\n")
            sections.append("| Variable | Percentile |")
            sections.append("|----------|------------|")
            for var_name, var_value in sorted(variables.items()):
                value_str = f"{var_value:.2f}" if var_value is not None else 'N/A'
                sections.append(f"| {var_name} | {value_str} |")

        return '\n'.join(sections)

    def _create_precipitation_forecast_section(self, forecast_data):
        """Create precipitation forecast section."""
        count = len(forecast_data)

        section = f"""### ☔ Precipitation Forecast ({count} hours)

| Time | Probability | Amount (in) | Condition |
|------|-------------|-------------|-----------|
"""

        # Limit to 12 hours for readability
        for hour_data in forecast_data[:12]:
            time_str = hour_data.get('time', 'N/A')
            if 'T' in time_str:
                # Format ISO timestamp
                time_str = time_str.split('T')[1][:5]  # Get HH:MM

            prob = hour_data.get('precipitation_probability', 0)
            amount = hour_data.get('precipitation_amount_in', 0)
            condition = hour_data.get('weather_condition', 'N/A')

            section += f"| {time_str} | {prob:.1f}% | {amount:.2f} | {condition} |\n"

        if count > 12:
            section += f"\n*Showing 12 of {count} total hours*\n"

        return section

    def _create_precipitation_history_section(self, history_data):
        """Create precipitation history section."""
        # Only show recent 12 months
        recent_data = sorted(
            history_data,
            key=lambda x: (x['year'], x['month']),
            reverse=True
        )[:12]

        if not recent_data:
            return ""

        section = """### 🌧️ Recent Precipitation History (12 months)

| Year-Month | Precipitation (in) |
|------------|-------------------|
"""

        for month_data in reversed(recent_data):
            year = month_data.get('year', 'N/A')
            month = month_data.get('month', 'N/A')
            precip = month_data.get('precipitation_in', 0)

            section += f"| {year}-{month:02d} | {precip:.2f} |\n"

        return section

    def _create_metadata_section(self, result_data):
        """Create metadata footer section."""
        sections = []

        sections.append("---\n")
        sections.append("## 📋 Report Metadata\n")

        # Intent analysis if available
        if 'filtered_context' in result_data:
            intent = result_data['filtered_context'].get('intent_analysis', {})
            if intent:
                sections.append("### Data Selection Criteria\n")
                sections.append("| Data Type | Included |")
                sections.append("|-----------|----------|")
                sections.append(f"| Precipitation Forecast | {'✅ Yes' if intent.get('needs_precipitation_forecast') else '❌ No'} |")
                sections.append(f"| Precipitation History | {'✅ Yes' if intent.get('needs_precipitation_history') else '❌ No'} |")
                sections.append(f"| Flood History | {'✅ Yes' if intent.get('needs_flood_history') else '❌ No'} |")
                sections.append(f"| SVI Data | {'✅ Yes' if intent.get('needs_svi_data') else '❌ No'} |")
                sections.append(f"| County Information | {'✅ Yes' if intent.get('needs_county_info') else '❌ No'} |")
                sections.append("")

        # Disclaimer
        sections.append("""### ⚠️ Disclaimer

This report is generated automatically based on available data and AI-powered analysis.
The information should be used for informational purposes only. For critical decisions
regarding flood safety and preparedness, please consult official sources such as
NOAA, FEMA, and local emergency management agencies.

---

*Generated by FLAI Flood Information System*
""")

        return '\n'.join(sections)


def generate_markdown_from_json(json_path, output_filename=None):
    """
    Convenience function to generate Markdown from a JSON file.

    Args:
        json_path: Path to JSON file containing query results
        output_filename: Optional custom output filename

    Returns:
        Path to generated Markdown file
    """
    with open(json_path, 'r') as f:
        result_data = json.load(f)

    generator = FloodMarkdownGenerator()
    return generator.generate_report(result_data, output_filename)


def generate_markdown_from_dict(result_dict, output_filename=None):
    """
    Convenience function to generate Markdown from a dictionary.

    Args:
        result_dict: Dictionary containing query results
        output_filename: Optional custom output filename

    Returns:
        Path to generated Markdown file
    """
    generator = FloodMarkdownGenerator()
    return generator.generate_report(result_dict, output_filename)


if __name__ == "__main__":
    import sys

    print("="*70)
    print("Markdown Report Generator for Flood Query Results")
    print("="*70)
    print()

    if len(sys.argv) > 1:
        # Generate from command line argument
        json_file = sys.argv[1]
        if os.path.exists(json_file):
            print(f"Generating Markdown from: {json_file}")
            output_path = generate_markdown_from_json(json_file)
            print(f"✓ Markdown report generated: {output_path}")
        else:
            print(f"Error: File not found: {json_file}")
    else:
        # Interactive mode
        json_file = input("Enter path to JSON results file: ").strip()

        if os.path.exists(json_file):
            custom_name = input("Enter custom filename (or press Enter for auto): ").strip()
            output_name = custom_name if custom_name else None

            print(f"\nGenerating Markdown report...")
            output_path = generate_markdown_from_json(json_file, output_name)
            print(f"✓ Markdown report generated successfully!")
            print(f"  Location: {output_path}")
        else:
            print(f"Error: File not found: {json_file}")
