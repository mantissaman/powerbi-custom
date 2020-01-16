/*
*  Power BI Visual CLI
*
*  Copyright (c) Microsoft Corporation
*  All rights reserved.
*  MIT License
*
*  Permission is hereby granted, free of charge, to any person obtaining a copy
*  of this software and associated documentation files (the ""Software""), to deal
*  in the Software without restriction, including without limitation the rights
*  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
*  copies of the Software, and to permit persons to whom the Software is
*  furnished to do so, subject to the following conditions:
*
*  The above copyright notice and this permission notice shall be included in
*  all copies or substantial portions of the Software.
*
*  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
*  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
*  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
*  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
*  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
*  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
*  THE SOFTWARE.
*/
"use strict";

import "core-js/stable";
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import DataView = powerbi.DataView;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;
import * as d3 from "d3";
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import IColorPalette = powerbi.extensibility.IColorPalette;
import IColorInfo = powerbi.IColorInfo;
import ISelectionId = powerbi.visuals.ISelectionId;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import { VisualSettings, dataPointSettings } from "./settings";

interface BarChartViewModel {
    dataPoints: BarChartDataPoint[];
    dataMax: number;
}
interface BarChartDataPoint {
    value: number;
    category: string;
    color: string;
    selectionID: ISelectionId;
}
interface BarChartSettings{
    enableAxis: {
        show: boolean;
    }
}

function visualTransform(options: VisualUpdateOptions, host: IVisualHost): BarChartViewModel {
    let dataViews = options.dataViews;
    let defaultSettings: BarChartSettings ={
        enableAxis: {
            show: false
        }
    };

    let dataInfo: BarChartViewModel = {
        dataPoints: [],
        dataMax: 0
    }

    if (!dataViews
        || !dataViews[0]
        || !dataViews[0].categorical
        || !dataViews[0].categorical.categories
        || !dataViews[0].categorical.categories[0].source
        || !dataViews[0].categorical.values)
        return dataInfo;

    let categorical = dataViews[0].categorical;
    let category = categorical.categories[0];
    let dataValue = categorical.values[0];

    let dataPoints: BarChartDataPoint[] = [];
    let dataMax: number;

    let colorPalette: IColorPalette = host.colorPalette;

    for (let i = 0, len = Math.max(category.values.length, dataValue.values.length); i < len; i++) {
        dataPoints.push({
            category: <string>category.values[i],
            value: <number>dataValue.values[i],
            color: colorPalette.getColor(<string>category.values[i]).value,
            selectionID: host.createSelectionIdBuilder().withCategory(category, i).createSelectionId()
        })
    }
    dataMax = <number>dataValue.maxLocal;

    return {
        dataPoints: dataPoints,
        dataMax: dataMax
    }

}
export class Visual implements IVisual {
    private svg: d3.Selection<SVGAElement>;
    private barContainer: d3.Selection<SVGAElement>;
    private settings: VisualSettings;
    private host: IVisualHost;
    private selectionManager: ISelectionManager;
    private xAxis: d3.Selection<SVGAElement>;



    constructor(options: VisualConstructorOptions) {
        console.log('Visual constructor', options);
        this.svg = d3.select(options.element)
            .append('svg')
            .classed('barchart', true);
        this.barContainer = this.svg.append('g').classed('barContainer', true);

        this.xAxis = this.svg.append('g')
            .classed('xAxis', true);

        this.host = options.host;
        this.selectionManager = options.host.createSelectionManager();
    }

    public update(options: VisualUpdateOptions) {
        this.settings = Visual.parseSettings(options && options.dataViews && options.dataViews[0]);
      
        let transformedData = visualTransform(options, this.host)
        let width = options.viewport.width;
        let height = options.viewport.height;


        this.svg.attr({
            width: width,
            height: height
        });

        if(this.settings.dataPoint.showAxis){
            height = height - 25;
        }
        

        this.xAxis.style({
            'font-size': d3.min([height, width]) * 0.04
        });

        let yScale = d3.scale.linear()
            .domain([0, transformedData.dataMax])
            .range([height, 0]);

        let xScale = d3.scale.ordinal()
            .domain(transformedData.dataPoints.map(d => d.category))
            .rangeRoundBands([0, width], 0.1, 0.2);


        let xAxis = d3.svg.axis()
            .scale(xScale)
            .orient('bottom');

        this.xAxis.attr({ 'transform': 'translate(0, ' + height + ')' })
            .call(xAxis);

        let bars = this.barContainer
            .selectAll('.bar')
            .data(transformedData.dataPoints);

        bars.enter()
            .append('rect')
            .classed('bar', true);

        bars.attr({
            width: xScale.rangeBand(),
            height: data => height - yScale(<number>data.value),
            x: data => xScale(data.category),
            y: data => yScale(<number>data.value),
            fill: data => data.color,
        });

        let selectionManager = this.selectionManager;
        bars.on('click', function (dataPoint) {
            selectionManager.select(dataPoint.selectionID)
                .then((ids: ISelectionId[]) => {
                    bars.attr({
                        'fill-opacity': ids.length > 0 ? 0.5 : 1
                    })
                    d3.select(this).attr({
                        'fill-opacity': 1
                    })
                });
        });

        bars.exit().remove();
    }

    private static parseSettings(dataView: DataView): VisualSettings {
        return <VisualSettings>VisualSettings.parse(dataView);
    }

    /**
     * This function gets called for each of the objects defined in the capabilities files and allows you to select which of the
     * objects and properties you want to expose to the users in the property pane.
     *
     */
    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {
        return VisualSettings.enumerateObjectInstances(this.settings || VisualSettings.getDefault(), options);
    }
}