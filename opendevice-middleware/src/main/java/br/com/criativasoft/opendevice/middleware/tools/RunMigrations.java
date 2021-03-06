/*
 * *****************************************************************************
 * Copyright (c) 2013-2014 CriativaSoft (www.criativasoft.com.br)
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 *  Contributors:
 *  Ricardo JL Rufino - Initial API and Implementation
 * *****************************************************************************
 */

package br.com.criativasoft.opendevice.middleware.tools;

import br.com.criativasoft.opendevice.core.ODev;
import br.com.criativasoft.opendevice.core.model.OpenDeviceConfig;
import org.flywaydb.core.Flyway;

/**
 * @author Ricardo JL Rufino
 *         Date: 24/06/17
 */
public class RunMigrations {

    public static void main(String[] args) {
        OpenDeviceConfig config = ODev.getConfig();
        Flyway flyway = new Flyway();
        flyway.setDataSource(config.getDatabasePath(), null, null);
        flyway.setBaselineOnMigrate(true);
        flyway.migrate();
    }
}
