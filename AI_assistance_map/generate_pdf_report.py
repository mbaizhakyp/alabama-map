#!/usr/bin/env python3
"""
PDF Report Generator for Flood Query Results

This module generates professional PDF reports from flood query results,
including structured data visualizations, tables, and formatted text.
"""

from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, Image, HRFlowable
)
from reportlab.lib.colors import HexColor
from datetime import datetime
import json
import os
import re


class FloodReportGenerator:
    """
    Generates professional PDF reports for flood query results.
    """

    def __init__(self, output_dir="results"):
        """
        Initialize the PDF generator.

        Args:
            output_dir: Directory to save PDF reports
        """
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

        # Define custom styles
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()

        # Color scheme
        self.primary_color = HexColor('#1E3A8A')  # Dark blue
        self.secondary_color = HexColor('#3B82F6')  # Light blue
        self.accent_color = HexColor('#EF4444')  # Red for warnings
        self.success_color = HexColor('#10B981')  # Green
        self.gray_color = HexColor('#6B7280')  # Gray

    def _convert_markdown_to_html(self, text):
        """
        Convert Markdown formatting to PDF-friendly HTML.

        Handles:
        - **bold** -> <b>bold</b>
        - *italic* -> <i>italic</i>
        - # headers -> removed (headers handled separately)
        - - bullet points -> <bullet>•</bullet> with proper formatting
        - Removes Markdown artifacts
        """
        if not text:
            return text

        # Remove header markers (###, ##, #) at line starts
        text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)

        # Convert **bold** to <b>bold</b>
        text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)

        # Convert *italic* to <i>italic</i> (but not already converted bold)
        text = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'<i>\1</i>', text)

        # Handle bullet points: convert "- item" or "* item" to bullet format
        lines = text.split('\n')
        converted_lines = []

        for line in lines:
            # Check if line starts with bullet marker
            bullet_match = re.match(r'^[\s]*[-\*]\s+(.+)$', line)
            if bullet_match:
                # Convert to bullet point with proper indentation
                content = bullet_match.group(1)
                converted_lines.append(f'  • {content}')
            else:
                converted_lines.append(line)

        text = '\n'.join(converted_lines)

        # Convert line breaks to <br/> for proper paragraph formatting
        # But preserve double line breaks as paragraph separators
        text = text.replace('\n\n', '<br/><br/>')
        text = text.replace('\n', '<br/>')

        return text

    def _setup_custom_styles(self):
        """Setup custom paragraph styles."""
        # Only add styles if they don't already exist
        style_names = [s.name for s in self.styles.byName.values()]

        # Title style
        if 'CustomTitle' not in style_names:
            self.styles.add(ParagraphStyle(
                name='CustomTitle',
                parent=self.styles['Heading1'],
                fontSize=24,
                textColor=HexColor('#1E3A8A'),
                spaceAfter=30,
                alignment=TA_CENTER,
                fontName='Helvetica-Bold'
            ))

        # Section header style
        if 'SectionHeader' not in style_names:
            self.styles.add(ParagraphStyle(
                name='SectionHeader',
                parent=self.styles['Heading2'],
                fontSize=16,
                textColor=HexColor('#1E3A8A'),
                spaceAfter=12,
                spaceBefore=20,
                fontName='Helvetica-Bold',
                borderWidth=0,
                borderColor=HexColor('#3B82F6'),
                borderPadding=5,
                backColor=HexColor('#EFF6FF')
            ))

        # Subsection header style
        if 'SubsectionHeader' not in style_names:
            self.styles.add(ParagraphStyle(
                name='SubsectionHeader',
                parent=self.styles['Heading3'],
                fontSize=14,
                textColor=HexColor('#3B82F6'),
                spaceAfter=10,
                spaceBefore=15,
                fontName='Helvetica-Bold'
            ))

        # Body text style
        if 'BodyText' not in style_names:
            self.styles.add(ParagraphStyle(
                name='BodyText',
                parent=self.styles['Normal'],
                fontSize=11,
                textColor=HexColor('#1F2937'),
                spaceAfter=12,
                alignment=TA_JUSTIFY,
                leading=14
            ))

        # Info box style
        if 'InfoBox' not in style_names:
            self.styles.add(ParagraphStyle(
                name='InfoBox',
                parent=self.styles['Normal'],
                fontSize=10,
                textColor=HexColor('#1F2937'),
                backColor=HexColor('#F3F4F6'),
                borderWidth=1,
                borderColor=HexColor('#D1D5DB'),
                borderPadding=10,
                spaceAfter=15,
                leading=13
            ))

    def generate_report(self, result_data, output_filename=None):
        """
        Generate a comprehensive PDF report from query results.

        Args:
            result_data: Dictionary containing query results
            output_filename: Optional custom filename

        Returns:
            Path to the generated PDF file
        """
        if output_filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_filename = f"flood_report_{timestamp}.pdf"

        output_path = os.path.join(self.output_dir, output_filename)

        # Create PDF document
        doc = SimpleDocTemplate(
            output_path,
            pagesize=letter,
            rightMargin=0.75*inch,
            leftMargin=0.75*inch,
            topMargin=1*inch,
            bottomMargin=0.75*inch
        )

        # Build document content
        story = []

        # Add header
        story.extend(self._create_header(result_data))

        # Add query and answer
        story.extend(self._create_query_section(result_data))

        # Add location information
        if 'filtered_context' in result_data:
            filtered_data = result_data['filtered_context'].get('filtered_data', [])
            for location_data in filtered_data:
                story.extend(self._create_location_section(location_data))

        # Add metadata footer
        story.extend(self._create_metadata_section(result_data))

        # Build PDF
        doc.build(story)

        return output_path

    def _create_header(self, result_data):
        """Create report header."""
        elements = []

        # Title
        title = Paragraph(
            "Flood Information Report",
            self.styles['CustomTitle']
        )
        elements.append(title)

        # Generation date
        date_text = f"Generated: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}"
        date_para = Paragraph(
            f"<i>{date_text}</i>",
            self.styles['Normal']
        )
        elements.append(date_para)
        elements.append(Spacer(1, 0.3*inch))

        # Horizontal line
        elements.append(HRFlowable(
            width="100%",
            thickness=2,
            color=self.primary_color,
            spaceAfter=0.2*inch
        ))

        return elements

    def _create_query_section(self, result_data):
        """Create the query and answer section."""
        elements = []

        # Query
        query_header = Paragraph("Query", self.styles['SectionHeader'])
        elements.append(query_header)

        query_text = result_data.get('query', 'N/A')
        query_para = Paragraph(
            f'<b>"{query_text}"</b>',
            self.styles['BodyText']
        )
        elements.append(query_para)
        elements.append(Spacer(1, 0.2*inch))

        # Answer
        answer_header = Paragraph("Answer", self.styles['SectionHeader'])
        elements.append(answer_header)

        answer_text = result_data.get('answer', 'No answer generated.')

        # Convert Markdown formatting to HTML
        answer_text = self._convert_markdown_to_html(answer_text)

        # Split answer into paragraphs (double line breaks)
        answer_paragraphs = answer_text.split('<br/><br/>')

        for para_text in answer_paragraphs:
            if para_text.strip():
                # Remove any remaining single <br/> at start/end
                para_text = para_text.strip()

                # Check if it's a section header (line ending with colon, short length)
                # Look for text before first <br/> if exists
                first_line = para_text.split('<br/>')[0] if '<br/>' in para_text else para_text

                if ':' in first_line and len(first_line) < 100 and not first_line.startswith('  •'):
                    # It's a header - make it bold if not already
                    if not first_line.startswith('<b>'):
                        para_text = para_text.replace(first_line, f'<b>{first_line}</b>', 1)

                para = Paragraph(para_text, self.styles['BodyText'])
                elements.append(para)
                elements.append(Spacer(1, 6))  # Small space between paragraphs

        elements.append(Spacer(1, 0.3*inch))

        return elements

    def _create_location_section(self, location_data):
        """Create detailed section for a specific location."""
        elements = []

        # Location header
        input_loc = location_data.get('input_location', {})
        loc_name = input_loc.get('name', 'Unknown Location')

        elements.append(PageBreak())

        header = Paragraph(
            f"Detailed Data: {loc_name}",
            self.styles['SectionHeader']
        )
        elements.append(header)

        # Location info box
        formatted_address = input_loc.get('formatted_address', 'N/A')
        lat = input_loc.get('latitude', 'N/A')
        lng = input_loc.get('longitude', 'N/A')

        loc_info_text = f"""
        <b>Address:</b> {formatted_address}<br/>
        <b>Coordinates:</b> {lat}, {lng}
        """
        loc_info = Paragraph(loc_info_text, self.styles['InfoBox'])
        elements.append(loc_info)

        # County information
        if 'county_data' in location_data:
            elements.extend(self._create_county_section(location_data['county_data']))

        # Flood event history
        if 'flood_event_history' in location_data:
            elements.extend(self._create_flood_events_section(location_data['flood_event_history']))

        # SVI data
        if 'social_vulnerability_index' in location_data:
            elements.extend(self._create_svi_section(location_data['social_vulnerability_index']))

        # Precipitation forecast
        if 'precipitation_forecast' in location_data and location_data['precipitation_forecast']:
            elements.extend(self._create_precipitation_forecast_section(location_data['precipitation_forecast']))

        # Precipitation history
        if 'precipitation_history' in location_data and location_data['precipitation_history']:
            elements.extend(self._create_precipitation_history_section(location_data['precipitation_history']))

        return elements

    def _create_county_section(self, county_data):
        """Create county information section."""
        elements = []

        header = Paragraph("County Information", self.styles['SubsectionHeader'])
        elements.append(header)

        data = [
            ['County', county_data.get('county_name', 'N/A')],
            ['State', county_data.get('state_name', 'N/A')],
            ['FIPS Code', county_data.get('fips_code', 'N/A')],
            ['Area (sq mi)', f"{county_data.get('area_sqmi', 0):.2f}"]
        ]

        table = Table(data, colWidths=[2*inch, 4*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), HexColor('#F3F4F6')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#D1D5DB')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))

        elements.append(table)
        elements.append(Spacer(1, 0.2*inch))

        return elements

    def _create_flood_events_section(self, flood_events):
        """Create flood events table."""
        elements = []

        header = Paragraph(
            f"Historical Flood Events ({len(flood_events)} events)",
            self.styles['SubsectionHeader']
        )
        elements.append(header)

        if not flood_events:
            elements.append(Paragraph("No flood events recorded.", self.styles['BodyText']))
            return elements

        # Create table data
        table_data = [['Date', 'Type', 'Distance (mi)', 'Warning Zone']]

        for event in flood_events[:10]:  # Limit to 10 events
            table_data.append([
                event.get('date', 'N/A'),
                event.get('type', 'N/A'),
                f"{event.get('distance_from_query_point_miles', 0):.2f}",
                event.get('warning_zone', 'N/A')
            ])

        table = Table(table_data, colWidths=[1.5*inch, 1.8*inch, 1.2*inch, 1.3*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), self.primary_color),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#D1D5DB')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, HexColor('#F9FAFB')])
        ]))

        elements.append(table)
        elements.append(Spacer(1, 0.2*inch))

        return elements

    def _create_svi_section(self, svi_data):
        """Create SVI data section."""
        elements = []

        header = Paragraph("Social Vulnerability Index (SVI)", self.styles['SubsectionHeader'])
        elements.append(header)

        # Overall rankings
        overall = svi_data.get('overall_ranking', {})
        national = overall.get('national')
        state = overall.get('state')

        if national is not None or state is not None:
            ranking_text = f"""
            <b>Overall Rankings:</b><br/>
            National Percentile: {f'{national:.2f}' if national is not None else 'N/A'}<br/>
            State Percentile: {f'{state:.2f}' if state is not None else 'N/A'}
            """
            ranking_para = Paragraph(ranking_text, self.styles['InfoBox'])
            elements.append(ranking_para)

        # Theme rankings
        themes = svi_data.get('themes', {})
        if themes:
            theme_header = Paragraph("Theme Rankings", self.styles['BodyText'])
            elements.append(theme_header)

            theme_data = [['Theme', 'Percentile']]
            for theme_name, theme_value in themes.items():
                theme_data.append([
                    theme_name,
                    f"{theme_value:.2f}" if theme_value is not None else 'N/A'
                ])

            theme_table = Table(theme_data, colWidths=[4*inch, 1.5*inch])
            theme_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), self.secondary_color),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#D1D5DB')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, HexColor('#F9FAFB')])
            ]))

            elements.append(theme_table)
            elements.append(Spacer(1, 0.15*inch))

        # Variable data
        variables = svi_data.get('variables', {})
        if variables:
            var_header = Paragraph(
                f"Key Variables ({len(variables)} selected)",
                self.styles['BodyText']
            )
            elements.append(var_header)

            var_data = [['Variable', 'Percentile']]
            for var_name, var_value in sorted(variables.items()):
                var_data.append([
                    var_name,
                    f"{var_value:.2f}" if var_value is not None else 'N/A'
                ])

            var_table = Table(var_data, colWidths=[4*inch, 1.5*inch])
            var_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), self.secondary_color),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#D1D5DB')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, HexColor('#F9FAFB')])
            ]))

            elements.append(var_table)

        elements.append(Spacer(1, 0.2*inch))

        return elements

    def _create_precipitation_forecast_section(self, forecast_data):
        """Create precipitation forecast section."""
        elements = []

        header = Paragraph(
            f"Precipitation Forecast ({len(forecast_data)} hours)",
            self.styles['SubsectionHeader']
        )
        elements.append(header)

        table_data = [['Time', 'Probability', 'Amount (in)', 'Condition']]

        for hour_data in forecast_data[:12]:  # Limit to 12 hours
            time_str = hour_data.get('time', 'N/A')
            if 'T' in time_str:
                # Format ISO timestamp
                time_str = time_str.split('T')[1][:5]  # Get HH:MM

            table_data.append([
                time_str,
                f"{hour_data.get('precipitation_probability', 0):.1f}%",
                f"{hour_data.get('precipitation_amount_in', 0):.2f}",
                hour_data.get('weather_condition', 'N/A')
            ])

        table = Table(table_data, colWidths=[1.5*inch, 1.3*inch, 1.3*inch, 2.5*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), self.primary_color),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#D1D5DB')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, HexColor('#F9FAFB')])
        ]))

        elements.append(table)
        elements.append(Spacer(1, 0.2*inch))

        return elements

    def _create_precipitation_history_section(self, history_data):
        """Create precipitation history section (show recent months)."""
        elements = []

        # Only show recent 12 months
        recent_data = sorted(
            history_data,
            key=lambda x: (x['year'], x['month']),
            reverse=True
        )[:12]

        if not recent_data:
            return elements

        header = Paragraph(
            "Recent Precipitation History (12 months)",
            self.styles['SubsectionHeader']
        )
        elements.append(header)

        table_data = [['Year-Month', 'Precipitation (inches)']]

        for month_data in reversed(recent_data):
            year = month_data.get('year', 'N/A')
            month = month_data.get('month', 'N/A')
            precip = month_data.get('precipitation_in', 0)

            table_data.append([
                f"{year}-{month:02d}",
                f"{precip:.2f}"
            ])

        table = Table(table_data, colWidths=[2*inch, 2*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), self.primary_color),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#D1D5DB')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, HexColor('#F9FAFB')])
        ]))

        elements.append(table)
        elements.append(Spacer(1, 0.2*inch))

        return elements

    def _create_metadata_section(self, result_data):
        """Create metadata footer section."""
        elements = []

        elements.append(PageBreak())

        header = Paragraph("Report Metadata", self.styles['SectionHeader'])
        elements.append(header)

        # Intent analysis if available
        if 'filtered_context' in result_data:
            intent = result_data['filtered_context'].get('intent_analysis', {})
            if intent:
                intent_text = f"""
                <b>Data Selection Criteria:</b><br/>
                Precipitation Forecast: {'Yes' if intent.get('needs_precipitation_forecast') else 'No'}<br/>
                Precipitation History: {'Yes' if intent.get('needs_precipitation_history') else 'No'}<br/>
                Flood History: {'Yes' if intent.get('needs_flood_history') else 'No'}<br/>
                SVI Data: {'Yes' if intent.get('needs_svi_data') else 'No'}<br/>
                County Information: {'Yes' if intent.get('needs_county_info') else 'No'}
                """
                intent_para = Paragraph(intent_text, self.styles['InfoBox'])
                elements.append(intent_para)

        # Disclaimer
        disclaimer = Paragraph(
            """
            <b>Disclaimer:</b> This report is generated automatically based on available data
            and AI-powered analysis. The information should be used for informational purposes
            only. For critical decisions regarding flood safety and preparedness, please consult
            official sources such as NOAA, FEMA, and local emergency management agencies.
            """,
            self.styles['BodyText']
        )
        elements.append(disclaimer)

        return elements


def generate_pdf_from_json(json_path, output_filename=None):
    """
    Convenience function to generate PDF from a JSON file.

    Args:
        json_path: Path to JSON file containing query results
        output_filename: Optional custom output filename

    Returns:
        Path to generated PDF
    """
    with open(json_path, 'r') as f:
        result_data = json.load(f)

    generator = FloodReportGenerator()
    return generator.generate_report(result_data, output_filename)


def generate_pdf_from_dict(result_dict, output_filename=None):
    """
    Convenience function to generate PDF from a dictionary.

    Args:
        result_dict: Dictionary containing query results
        output_filename: Optional custom output filename

    Returns:
        Path to generated PDF
    """
    generator = FloodReportGenerator()
    return generator.generate_report(result_dict, output_filename)


if __name__ == "__main__":
    import sys

    print("="*70)
    print("PDF Report Generator for Flood Query Results")
    print("="*70)
    print()

    if len(sys.argv) > 1:
        # Generate from command line argument
        json_file = sys.argv[1]
        if os.path.exists(json_file):
            print(f"Generating PDF from: {json_file}")
            output_path = generate_pdf_from_json(json_file)
            print(f"✓ PDF report generated: {output_path}")
        else:
            print(f"Error: File not found: {json_file}")
    else:
        # Interactive mode
        json_file = input("Enter path to JSON results file: ").strip()

        if os.path.exists(json_file):
            custom_name = input("Enter custom filename (or press Enter for auto): ").strip()
            output_name = custom_name if custom_name else None

            print(f"\nGenerating PDF report...")
            output_path = generate_pdf_from_json(json_file, output_name)
            print(f"✓ PDF report generated successfully!")
            print(f"  Location: {output_path}")
        else:
            print(f"Error: File not found: {json_file}")
